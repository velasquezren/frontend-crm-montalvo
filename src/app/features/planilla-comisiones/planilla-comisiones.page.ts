import { DatePipe, DecimalPipe } from '@angular/common';
import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';

import { mensajeDeError } from '../../core/api/http-error';
import { paginaVacia, RespuestaPaginada } from '../../core/api/pagination.model';
import { ToastService } from '../../core/toast/toast.service';
import { BadgeComponent } from '../../shared/components/badge/badge.component';
import { ButtonComponent } from '../../shared/components/button/button.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { IconComponent } from '../../shared/components/icon/icon.component';
import { InputComponent } from '../../shared/components/input/input.component';
import { LoadingSkeletonComponent } from '../../shared/components/loading-skeleton/loading-skeleton.component';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { PaginatorComponent } from '../../shared/components/paginator/paginator.component';
import { MonedaPipe } from '../../shared/pipes/moneda.pipe';
import { PlanillaComisionesService } from './planilla-comisiones.service';
import {
  AgenteVinculable,
  Alertas,
  ClasifComision,
  CLASIF_LABEL,
  ConfiguracionPlanilla,
  ESTADO_PERIODO_LABEL,
  MESES,
  PeriodoComision,
  ReporteConsolidado,
  ResumenImportacion,
  TIPO_LABEL,
  Vendedora,
  VentaImportada,
} from './planilla.model';

type Pestana = 'IMPORTAR' | 'CLASIFICACION' | 'REPORTES' | 'CONFIGURACION';

/**
 * Planilla de Comisiones — liquidación mensual del equipo comercial a partir
 * del Excel que exporta FileMaker.
 *
 * Flujo: subir el Excel → revisar cómo quedó clasificado (y corregir lo que
 * haga falta) → calcular → leer los reportes. Solo ADMIN (adminGuard + @Roles).
 */
@Component({
  selector: 'app-planilla-comisiones',
  imports: [
    DatePipe,
    DecimalPipe,
    MonedaPipe,
    BadgeComponent,
    ButtonComponent,
    EmptyStateComponent,
    IconComponent,
    InputComponent,
    LoadingSkeletonComponent,
    PageHeaderComponent,
    PaginatorComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './planilla-comisiones.page.html',
  styleUrl: './planilla-comisiones.page.css',
})
export class PlanillaComisionesPage {
  private readonly service = inject(PlanillaComisionesService);
  private readonly toast = inject(ToastService);

  protected readonly clasifLabel = CLASIF_LABEL;
  protected readonly estadoLabel = ESTADO_PERIODO_LABEL;
  protected readonly tipoLabel = TIPO_LABEL;
  protected readonly meses = MESES;
  protected readonly clasificaciones = Object.keys(CLASIF_LABEL) as ClasifComision[];

  /* ── Estado de UI ───────────────────────────────────────────────────── */

  protected readonly pestana = signal<Pestana>('IMPORTAR');
  protected readonly periodoId = signal<string | null>(null);

  protected readonly subiendo = signal(false);
  protected readonly calculando = signal(false);
  protected readonly ultimaImportacion = signal<ResumenImportacion | null>(null);

  protected readonly pagina = signal(1);
  protected readonly busqueda = signal('');
  protected readonly filtroClasif = signal<ClasifComision | null>(null);
  protected readonly soloExcluidas = signal(false);
  protected readonly soloSinClasificar = signal(false);

  /** Búsqueda con retardo, para no pegarle al backend en cada tecla. */
  private readonly busquedaDebounced = signal('');

  protected readonly alertas = signal<Alertas | null>(null);
  protected readonly consolidado = signal<ReporteConsolidado | null>(null);
  protected readonly configuracion = signal<ConfiguracionPlanilla | null>(null);

  constructor() {
    effect(onCleanup => {
      const texto = this.busqueda();
      const id = setTimeout(() => this.busquedaDebounced.set(texto), 350);
      onCleanup(() => clearTimeout(id));
    });

    // Al elegir otro periodo se recargan sus alertas y su reporte.
    effect(() => {
      const id = this.periodoId();
      if (!id) return;
      void this.refrescarPanelesDelPeriodo(id);
    });
  }

  /* ── Recursos ───────────────────────────────────────────────────────── */

  protected readonly periodos = httpResource<RespuestaPaginada<PeriodoComision>>(
    () => this.service.periodosRequest(),
    { defaultValue: paginaVacia<PeriodoComision>() },
  );

  protected readonly ventas = httpResource<RespuestaPaginada<VentaImportada>>(
    () => {
      const id = this.periodoId();
      if (!id) return undefined;
      return this.service.ventasRequest(id, {
        pagina: this.pagina(),
        clasif: this.filtroClasif() ?? undefined,
        buscar: this.busquedaDebounced() || undefined,
        soloExcluidas: this.soloExcluidas(),
        soloSinClasificar: this.soloSinClasificar(),
      });
    },
    { defaultValue: paginaVacia<VentaImportada>() },
  );

  protected readonly vendedoras = httpResource<Vendedora[]>(
    () => this.service.vendedorasRequest(),
    { defaultValue: [] },
  );

  /** Agentes del CRM para el desplegable de vinculación manual. */
  protected readonly agentes = httpResource<AgenteVinculable[]>(
    () => this.service.agentesVinculablesRequest(),
    { defaultValue: [] },
  );

  /* ── Derivados ──────────────────────────────────────────────────────── */

  protected readonly periodoActual = computed(() => {
    const id = this.periodoId();
    return this.periodos.value().datos.find(p => p.id === id) ?? null;
  });

  protected readonly hayAlertas = computed(() => {
    const a = this.alertas();
    if (!a) return false;
    const t = a.totales;
    return t.filasSinClasificar > 0 || t.vendedorasSinConfigurar > 0 || t.filasExcluidas > 0;
  });

  /* ── Acciones ───────────────────────────────────────────────────────── */

  protected setPestana(p: Pestana): void {
    this.pestana.set(p);
  }

  protected seleccionarPeriodo(id: string): void {
    this.periodoId.set(id);
    this.pagina.set(1);
  }

  protected nombreMes(mes: number): string {
    return this.meses[mes - 1] ?? String(mes);
  }

  /** Sube el Excel elegido en el input de archivo. */
  protected async subirArchivo(evento: Event): Promise<void> {
    const input = evento.target as HTMLInputElement;
    const archivo = input.files?.[0];
    if (!archivo) return;

    this.subiendo.set(true);
    try {
      const respuesta = await this.service.importar(archivo);
      this.ultimaImportacion.set(respuesta.resumen);
      this.periodos.reload();
      this.vendedoras.reload();
      this.periodoId.set(respuesta.periodo.id);
      this.pestana.set('CLASIFICACION');
      this.toast.success(
        `${respuesta.resumen.filasLeidas} filas leídas, ${respuesta.resumen.filasComisionables} comisionables.`,
        `Planilla ${this.nombreMes(respuesta.periodo.mes)} ${respuesta.periodo.anio}`,
      );
    } catch (err) {
      this.toast.error(mensajeDeError(err, 'No se pudo importar el Excel.'), 'Error');
    } finally {
      this.subiendo.set(false);
      // Permite volver a elegir el mismo archivo si hubo que corregirlo.
      input.value = '';
    }
  }

  protected async calcular(): Promise<void> {
    const id = this.periodoId();
    if (!id || this.calculando()) return;

    this.calculando.set(true);
    try {
      const resultado = await this.service.calcular(id);
      this.toast.success(
        `${resultado.vendedorasLiquidadas} vendedoras · $${resultado.totalComisionUsd} USD en comisiones.`,
        'Planilla calculada',
      );
      this.periodos.reload();
      await this.refrescarPanelesDelPeriodo(id);
      this.pestana.set('REPORTES');
    } catch (err) {
      this.toast.error(mensajeDeError(err, 'No se pudo calcular la planilla.'), 'Error');
    } finally {
      this.calculando.set(false);
    }
  }

  /** Corrige la clasificación de una fila desde la tabla de revisión. */
  protected async cambiarClasificacion(venta: VentaImportada, valor: string): Promise<void> {
    const clasif = valor as ClasifComision;
    if (!clasif || clasif === venta.clasif) return;

    try {
      await this.service.ajustarVenta(venta.id, { clasif });
      this.toast.success(`"${venta.detalle}" → ${this.clasifLabel[clasif]}`, 'Clasificación ajustada');
      this.ventas.reload();
      const id = this.periodoId();
      if (id) await this.refrescarPanelesDelPeriodo(id);
    } catch (err) {
      this.toast.error(mensajeDeError(err, 'No se pudo ajustar la fila.'), 'Error');
    }
  }

  /** Crea una regla del diccionario para que el servicio se clasifique solo. */
  protected async crearReglaDesdeServicio(detalle: string, clasif: ClasifComision): Promise<void> {
    try {
      await this.service.crearRegla({ patron: detalle, clasif, prioridad: 50 });
      this.toast.success(
        `A partir de ahora "${detalle}" se clasificará como ${this.clasifLabel[clasif]}. Reimporta el mes para aplicarlo.`,
        'Regla creada',
      );
      await this.cargarConfiguracion();
    } catch (err) {
      this.toast.error(mensajeDeError(err, 'No se pudo crear la regla.'), 'Error');
    }
  }

  protected async guardarVendedora(
    vendedora: Vendedora,
    cambios: Partial<Vendedora>,
  ): Promise<void> {
    try {
      await this.service.actualizarVendedora(vendedora.id, cambios);
      this.toast.success(`${vendedora.nombre} actualizada.`, 'Guardado');
      this.vendedoras.reload();
      const id = this.periodoId();
      if (id) await this.refrescarPanelesDelPeriodo(id);
    } catch (err) {
      this.toast.error(mensajeDeError(err, 'No se pudo guardar.'), 'Error');
    }
  }

  /**
   * Vincula (o desvincula, con cadena vacía) la vendedora del Excel con el
   * agente del CRM que es la misma persona.
   */
  protected async vincularAgente(vendedora: Vendedora, usuarioId: string): Promise<void> {
    try {
      await this.service.actualizarVendedora(vendedora.id, { usuarioId: usuarioId || null });
      this.toast.success(
        usuarioId
          ? `${vendedora.nombre} quedó vinculada a su agente del CRM.`
          : `${vendedora.nombre} quedó sin vincular.`,
        'Vinculación actualizada',
      );
      this.vendedoras.reload();
      this.agentes.reload();
    } catch (err) {
      this.toast.error(mensajeDeError(err, 'No se pudo vincular al agente.'), 'Error');
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
    void this.guardarVendedora(vendedora, { sueldoBase: String(sueldoBase) });
  }

  protected async eliminarPeriodo(periodo: PeriodoComision): Promise<void> {
    try {
      await this.service.eliminarPeriodo(periodo.id);
      this.toast.success(
        `Planilla de ${this.nombreMes(periodo.mes)} ${periodo.anio} eliminada.`,
        'Eliminada',
      );
      if (this.periodoId() === periodo.id) this.periodoId.set(null);
      this.periodos.reload();
    } catch (err) {
      this.toast.error(mensajeDeError(err, 'No se pudo eliminar el periodo.'), 'Error');
    }
  }

  protected async cargarConfiguracion(): Promise<void> {
    try {
      this.configuracion.set(await this.service.obtenerConfiguracion());
    } catch (err) {
      this.toast.error(mensajeDeError(err, 'No se pudo cargar la configuración.'), 'Error');
    }
  }

  protected async abrirConfiguracion(): Promise<void> {
    this.pestana.set('CONFIGURACION');
    if (!this.configuracion()) await this.cargarConfiguracion();
  }

  protected async guardarTarifaPlan(clave: string, empresa: string, propio: string): Promise<void> {
    const pctEmpresa = Number(empresa);
    const pctPropio = Number(propio);
    if (!this.porcentajesValidos(pctEmpresa, pctPropio)) return;

    try {
      await this.service.actualizarTarifaPlan(clave, pctEmpresa, pctPropio);
      this.toast.success(`Tarifa ${clave} actualizada.`, 'Guardado');
      await this.cargarConfiguracion();
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
      await this.cargarConfiguracion();
    } catch (err) {
      this.toast.error(mensajeDeError(err, 'No se pudo guardar la tarifa.'), 'Error');
    }
  }

  protected async eliminarRegla(id: string, patron: string): Promise<void> {
    try {
      await this.service.eliminarRegla(id);
      this.toast.success(`Regla "${patron}" eliminada.`, 'Eliminada');
      await this.cargarConfiguracion();
    } catch (err) {
      this.toast.error(mensajeDeError(err, 'No se pudo eliminar la regla.'), 'Error');
    }
  }

  protected limpiarFiltros(): void {
    this.busqueda.set('');
    this.filtroClasif.set(null);
    this.soloExcluidas.set(false);
    this.soloSinClasificar.set(false);
    this.pagina.set(1);
  }

  protected filtrarPorClasif(valor: string): void {
    this.filtroClasif.set(valor ? (valor as ClasifComision) : null);
    this.pagina.set(1);
  }

  protected alternarSoloExcluidas(): void {
    this.soloExcluidas.update(v => !v);
    this.soloSinClasificar.set(false);
    this.pagina.set(1);
  }

  protected alternarSoloSinClasificar(): void {
    this.soloSinClasificar.update(v => !v);
    this.soloExcluidas.set(false);
    this.pagina.set(1);
  }

  private porcentajesValidos(empresa: number, propio: number): boolean {
    const valido = (n: number) => Number.isFinite(n) && n >= 0 && n <= 100;
    if (!valido(empresa) || !valido(propio)) {
      this.toast.error('Los porcentajes deben estar entre 0 y 100.', 'Dato inválido');
      return false;
    }
    return true;
  }

  /** Recarga alertas y consolidado del periodo activo (ambos en paralelo). */
  private async refrescarPanelesDelPeriodo(id: string): Promise<void> {
    const [alertas, consolidado] = await Promise.allSettled([
      this.service.obtenerAlertas(id),
      this.service.obtenerConsolidado(id),
    ]);

    this.alertas.set(alertas.status === 'fulfilled' ? alertas.value : null);
    // El consolidado solo existe si el periodo ya se calculó: su fallo es normal.
    this.consolidado.set(consolidado.status === 'fulfilled' ? consolidado.value : null);
  }
}
