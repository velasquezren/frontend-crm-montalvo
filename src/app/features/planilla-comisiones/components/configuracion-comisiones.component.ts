import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';

import { mensajeDeError } from '../../../core/api/http-error';
import { AuthService } from '../../../core/auth/auth.service';
import { ToastService } from '../../../core/toast/toast.service';
import { BadgeComponent } from '../../../shared/components/badge/badge.component';
import { ButtonComponent } from '../../../shared/components/button/button.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { FilterChipComponent } from '../../../shared/components/filter-chip/filter-chip.component';
import { InfoHintComponent } from '../../../shared/components/info-hint/info-hint.component';
import { InputComponent } from '../../../shared/components/input/input.component';
import { LoadingSkeletonComponent } from '../../../shared/components/loading-skeleton/loading-skeleton.component';
import { TableComponent } from '../../../shared/components/table/table.component';
import { MonedaPipe } from '../../../shared/pipes/moneda.pipe';
import { PlanillaComisionesService } from '../planilla-comisiones.service';
import {
  CambiosVendedora,
  ClasifComision,
  CLASIF_LABEL,
  ConfiguracionPlanilla,
  MESES,
  Objetivo,
  PeriodoComision,
  TipoVendedora,
  Vendedora,
} from '../planilla.model';

/**
 * Pestaña de Configuración de Comisiones.
 *
 * Consolida todas las reglas maestras del módulo de liquidación:
 * 1. Reglas globales del cálculo (parámetros y factores).
 * 2. Directorio de vendedoras (sueldo base, tipo y área).
 * 3. Tarifas Tipo A (Planes y paquetes).
 * 4. Tarifas Tipo C (Consultas, labs, ecografías y servicios sueltos).
 * 5. Escala Tipo B (Cirugías por volumen mensual).
 * 6. Histórico RA (Procedimientos de Reproducción Asistida).
 * 7. Canales de Captación (Mapeo empresa vs. propia).
 * 8. Metas comerciales (Base y específicas del periodo).
 * 9. Diccionario de clasificación por patrón de servicio.
 */
@Component({
  selector: 'app-configuracion-comisiones',
  imports: [
    MonedaPipe,
    BadgeComponent,
    ButtonComponent,
    EmptyStateComponent,
    FilterChipComponent,
    InfoHintComponent,
    InputComponent,
    LoadingSkeletonComponent,
    TableComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './configuracion-comisiones.component.html',
  styleUrl: './configuracion-comisiones.component.css',
})
export class ConfiguracionComisionesComponent {
  readonly periodo = input<PeriodoComision | null>(null);
  readonly configuracion = input<ConfiguracionPlanilla | null>(null);
  readonly vendedoras = input<readonly Vendedora[]>([]);
  readonly cargandoVendedoras = input(false);

  readonly configuracionModificada = output<void>();
  readonly vendedoraModificada = output<void>();

  private readonly service = inject(PlanillaComisionesService);
  private readonly toast = inject(ToastService);
  private readonly authService = inject(AuthService);

  protected readonly esSuperAdmin = this.authService.isSuperAdmin;
  protected readonly clasifLabel = CLASIF_LABEL;

  /** Campo para dar de alta un valor de captación nuevo desde configuración. */
  protected readonly captacionNueva = signal('');

  protected readonly parametrosConocidos: ReadonlyArray<{
    clave: string;
    titulo: string;
    ayuda: string;
    sufijo: string;
  }> = [
    {
      clave: 'PCT_TIPO_C_RA',
      titulo: 'Comisión del área RA',
      ayuda:
        'Porcentaje que aplica a las ventas cuya columna «area» del export dice RA. ' +
        'En 0 no pagan comisión directa, aunque siguen sumando al monto vendido del ' +
        'mes y por tanto a los bonos.',
      sufijo: '%  (0,045 = 4,5%)',
    },
    {
      clave: 'FACTOR_BONO_JEFATURA',
      titulo: 'Factor del bono de jefatura',
      ayuda:
        'Se aplica al excedente sobre el objetivo mensual de cada vendedora para armar ' +
        'el pote. El pote se paga DOS veces: íntegro a la jefatura y otro tanto ' +
        'repartido entre publicidad.',
      sufijo: '(0,002 = 0,2%)',
    },
    {
      clave: 'FACTOR_BONO_TRIMESTRAL',
      titulo: 'Factor del bono trimestral',
      ayuda:
        'Se aplica al PROMEDIO del trimestre, no al mes suelto, y solo si ese promedio ' +
        'supera el objetivo trimestral. Se paga únicamente en los meses de cierre: ' +
        'marzo, junio, septiembre y diciembre.',
      sufijo: '(0,005 = 0,5%)',
    },
    {
      clave: 'MESES_BONO_TRIMESTRAL',
      titulo: 'Meses que promedia el bono trimestral',
      ayuda:
        'Cuántos meses entran en el promedio, contando hacia atrás desde el mes que se ' +
        'liquida. Con 3, liquidar marzo promedia enero, febrero y marzo.',
      sufijo: 'meses',
    },
  ];

  /* ── Metas: base o propias del mes ───────────────────────────────────── */
  private readonly metasResueltas = signal<Objetivo[]>([]);
  protected readonly metasDelPeriodo = signal(false);

  protected readonly metasVisibles = computed(() =>
    this.metasDelPeriodo()
      ? this.metasResueltas()
      : (this.configuracion()?.objetivos ?? []),
  );

  protected readonly hayMetasPropias = computed(() =>
    this.metasResueltas().some(o => o.periodoId !== null),
  );

  protected nombreMes(mes: number): string {
    return MESES[mes - 1] ?? '';
  }

  protected valorParametro(clave: string): string {
    const p = this.configuracion()?.parametros.find(x => x.clave === clave);
    return p ? String(p.valor) : '';
  }

  protected async guardarParametro(clave: string, valor: string): Promise<void> {
    const numero = Number(valor.replace(',', '.').trim());
    if (!Number.isFinite(numero)) {
      this.toast.error(`"${valor}" no es un número.`, 'Parámetros');
      this.configuracionModificada.emit();
      return;
    }
    try {
      await this.service.actualizarParametro(clave, numero);
      this.toast.success(
        'Se aplica en el próximo cálculo: recalcula el periodo para verlo.',
        'Parámetro guardado',
      );
      this.configuracionModificada.emit();
    } catch (err) {
      this.toast.error(mensajeDeError(err, 'No se pudo guardar el parámetro.'), 'Parámetros');
    }
  }

  protected async guardarVendedora(
    vendedora: Vendedora,
    cambios: CambiosVendedora,
  ): Promise<void> {
    try {
      await this.service.actualizarVendedora(vendedora.id, cambios);
      this.toast.success(`${vendedora.nombre} actualizada.`, 'Guardado');
      this.vendedoraModificada.emit();
    } catch (err) {
      this.toast.error(mensajeDeError(err, 'No se pudo guardar.'), 'Error');
    }
  }

  protected cambiarTipoVendedora(vendedora: Vendedora, tipo: string): void {
    void this.guardarVendedora(vendedora, { tipo: tipo as Vendedora['tipo'] });
  }

  protected cambiarAreaVendedora(vendedora: Vendedora, area: string): void {
    void this.guardarVendedora(vendedora, { area: area as Vendedora['area'] });
  }

  protected guardarSueldo(vendedora: Vendedora, valor: string): void {
    const sueldoBase = Number(valor);
    if (!Number.isFinite(sueldoBase) || sueldoBase < 0) {
      this.toast.error('El sueldo base debe ser un número positivo.', 'Dato inválido');
      return;
    }
    void this.guardarVendedora(vendedora, { sueldoBase });
  }

  protected async guardarTarifaPlan(clave: string, empresa: string, propio: string): Promise<void> {
    const pctEmpresa = Number(empresa);
    const pctPropio = Number(propio);
    if (!this.porcentajesValidos(pctEmpresa, pctPropio)) return;

    try {
      await this.service.actualizarTarifaPlan(clave, pctEmpresa, pctPropio);
      this.toast.success(`Tarifa ${clave} actualizada.`, 'Guardado');
      this.configuracionModificada.emit();
    } catch (err) {
      this.toast.error(mensajeDeError(err, 'No se pudo guardar la tarifa.'), 'Error');
    }
  }

  protected async guardarTarifaServicio(
    clasif: ClasifComision,
    empresa: string,
    propio: string,
  ): Promise<void> {
    const pctEmpresa = Number(empresa);
    const pctPropio = Number(propio);
    if (!this.porcentajesValidos(pctEmpresa, pctPropio)) return;

    try {
      await this.service.actualizarTarifaServicio(clasif, pctEmpresa, pctPropio);
      this.toast.success(`Tarifa ${this.clasifLabel[clasif]} actualizada.`, 'Guardado');
      this.configuracionModificada.emit();
    } catch (err) {
      this.toast.error(mensajeDeError(err, 'No se pudo guardar la tarifa.'), 'Error');
    }
  }

  protected async guardarCaptacion(valor: string, canal: string): Promise<void> {
    const limpio = valor.trim();
    if (!limpio) {
      this.toast.error('Escribe el valor tal como aparece en el Excel.', 'Falta el valor');
      return;
    }

    try {
      const guardado = await this.service.guardarCaptacion(
        limpio,
        canal === 'PROPIO' ? 'PROPIO' : 'EMPRESA',
      );
      this.toast.success(`"${guardado.valor}" cuenta como ${guardado.canal}.`, 'Guardado');
      this.captacionNueva.set('');
      this.configuracionModificada.emit();
    } catch (err) {
      this.toast.error(mensajeDeError(err, 'No se pudo guardar la captación.'), 'Error');
    }
  }

  protected async eliminarCaptacion(valor: string): Promise<void> {
    try {
      await this.service.eliminarCaptacion(valor);
      this.toast.success(`"${valor}" vuelve a contar como EMPRESA.`, 'Eliminado');
      this.configuracionModificada.emit();
    } catch (err) {
      this.toast.error(mensajeDeError(err, 'No se pudo eliminar la captación.'), 'Error');
    }
  }

  protected async verMetas(delPeriodo: boolean): Promise<void> {
    this.metasDelPeriodo.set(delPeriodo);
    const periodo = this.periodo();
    if (delPeriodo && periodo) {
      try {
        this.metasResueltas.set(await this.service.objetivosDelPeriodo(periodo.id));
      } catch (err) {
        this.toast.error(mensajeDeError(err, 'No se pudieron cargar las metas del mes.'), 'Error');
      }
    }
  }

  protected async guardarMeta(
    objetivo: Objetivo,
    planpaq: string,
    plannin: string,
    mensual: string,
    trimestral: string,
  ): Promise<void> {
    const datos = {
      planpaqMinimos: Number(planpaq),
      planninMinimos: Number(plannin),
      montoMensualUsd: Number(mensual),
      montoTrimestralUsd: Number(trimestral),
    };

    if (Object.values(datos).some(v => !Number.isFinite(v) || v < 0)) {
      this.toast.error('Las metas deben ser números positivos.', 'Valor inválido');
      return;
    }

    const periodo = this.periodo();
    try {
      if (this.metasDelPeriodo() && periodo) {
        await this.service.guardarObjetivoDePeriodo(periodo.id, objetivo.tipo, datos);
        this.toast.success(`Meta de ${objetivo.tipo} guardada para este mes.`, 'Guardado');
        await this.verMetas(true);
      } else {
        await this.service.actualizarObjetivo(objetivo.id, datos);
        this.toast.success(`Meta base de ${objetivo.tipo} actualizada.`, 'Guardado');
        this.configuracionModificada.emit();
      }
    } catch (err) {
      this.toast.error(mensajeDeError(err, 'No se pudo guardar la meta.'), 'Error');
    }
  }

  protected async quitarMetaDelMes(tipo: TipoVendedora): Promise<void> {
    const periodo = this.periodo();
    if (!periodo) return;

    try {
      await this.service.eliminarObjetivoDePeriodo(periodo.id, tipo);
      this.toast.success(`${tipo} vuelve a la meta base.`, 'Eliminada');
      await this.verMetas(true);
    } catch (err) {
      this.toast.error(mensajeDeError(err, 'No se pudo quitar la meta del mes.'), 'Error');
    }
  }

  protected async eliminarRegla(id: string, patron: string): Promise<void> {
    try {
      await this.service.eliminarRegla(id);
      this.toast.success(`Regla "${patron}" eliminada.`, 'Eliminada');
      this.configuracionModificada.emit();
    } catch (err) {
      this.toast.error(mensajeDeError(err, 'No se pudo eliminar la regla.'), 'Error');
    }
  }

  private porcentajesValidos(empresa: number, propio: number): boolean {
    const valido = (n: number) => Number.isFinite(n) && n >= 0 && n <= 100;
    if (!valido(empresa) || !valido(propio)) {
      this.toast.error('Los porcentajes deben estar entre 0 y 100.', 'Dato inválido');
      return false;
    }
    return true;
  }
}
