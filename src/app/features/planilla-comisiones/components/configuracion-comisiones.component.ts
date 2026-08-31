import { OverlayRef } from '@angular/cdk/overlay';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
  TemplateRef,
  ViewContainerRef,
  viewChild,
} from '@angular/core';

import { mensajeDeError } from '../../../core/api/http-error';
import { AuthService } from '../../../core/auth/auth.service';
import { ToastService } from '../../../core/toast/toast.service';
import { BadgeComponent } from '../../../shared/components/badge/badge.component';
import { ButtonComponent } from '../../../shared/components/button/button.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { ErrorCargaComponent } from '../../../shared/components/error-carga/error-carga.component';
import { FilterChipComponent } from '../../../shared/components/filter-chip/filter-chip.component';
import { DialogService } from '../../../shared/components/dialog/dialog.service';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { InfoHintComponent } from '../../../shared/components/info-hint/info-hint.component';
import { InputComponent } from '../../../shared/components/input/input.component';
import { LoadingSkeletonComponent } from '../../../shared/components/loading-skeleton/loading-skeleton.component';
import { TableComponent } from '../../../shared/components/table/table.component';
import { MonedaPipe } from '../../../shared/pipes/moneda.pipe';
import { PlanillaComisionesService } from '../planilla-comisiones.service';
import {
  AreaVendedora,
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
 * 5b. Escala Tipo A (RA) — excedente combinado planes + RA no-cirugía (solo lectura hoy).
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
    ErrorCargaComponent,
    FilterChipComponent,
    IconComponent,
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
  /** true = la configuración no se pudo cargar. Distinto de "todavía cargando". */
  readonly errorConfiguracion = input(false);

  readonly configuracionModificada = output<void>();
  readonly vendedoraModificada = output<void>();
  readonly reintentarConfiguracion = output<void>();

  private readonly service = inject(PlanillaComisionesService);
  private readonly toast = inject(ToastService);
  private readonly authService = inject(AuthService);
  private readonly dialogService = inject(DialogService);
  private readonly vcr = inject(ViewContainerRef);

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
      titulo: 'Comisión de campaña/promoción del área RA',
      ayuda:
        'Solo aplica a ventas del área RA clasificadas como campaña o promoción — ' +
        'en 0 no pagan nada. El resto del área RA (consulta, laboratorio, ecografía, ' +
        'otros) NO usa este parámetro: comisiona por la escala Tipo A (RA) de más ' +
        'abajo, cuando el ingreso combinado con planes supera el objetivo mensual.',
      /* Ojo: este parámetro va en PUNTOS porcentuales (escribe 4.5 para 4,5%),
         no en fracción — al revés que los dos de abajo. El sufijo anterior decía
         "0,045 = 4,5%", la unidad contraria a la que de verdad usa el motor
         (`porcentaje / 100`, igual que pctEmpresa/pctPropio de cualquier tarifa).
         Quien siguiera ese hint al pie de la letra pagaría 0,045% en vez de 4,5%. */
      sufijo: '%  (escribe 4.5 para 4,5% — NO 0,045)',
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

  /* ── Directorio: quién sigue en el equipo y quién ya no ────────────────
   *
   * El directorio muestra un grupo por vez porque son dos preguntas distintas:
   * "a quién le estoy pagando este mes" y "a quién di de baja". Mezclarlas en
   * una sola lista hacía que, con el tiempo, hubiera que leer la columna de
   * estado fila por fila para saber cuál era cuál.
   *
   * El contador va en el chip aunque esté en cero: así se ve que la baja existe
   * como opción y, sobre todo, se ve cuánta gente hay escondida sin tener que
   * ir a buscarla. Una vendedora dada de baja que nadie recuerda es exactamente
   * la que después aparece "perdida" en un informe.
   */
  protected readonly verDadasDeBaja = signal(false);

  protected readonly vendedorasEnEquipo = computed(() =>
    this.vendedoras().filter(v => !v.oculta),
  );

  protected readonly vendedorasDadasDeBaja = computed(() =>
    this.vendedoras().filter(v => v.oculta),
  );

  protected readonly vendedorasVisibles = computed(() =>
    this.verDadasDeBaja() ? this.vendedorasDadasDeBaja() : this.vendedorasEnEquipo(),
  );

  /**
   * Nadie en marketing = el pote de jefatura se paga solo una vez.
   *
   * El pote se paga DOS veces —íntegro a la jefatura y otro tanto repartido
   * entre marketing—, así que sin nadie en esa área la mitad del pago
   * sencillamente no se emite. No falla nada: el cálculo deja un aviso en el
   * log del servidor y sigue. Esta línea es la única señal que ve una persona.
   *
   * Se mira sobre las que están en el equipo, no sobre todas: una persona de
   * marketing dada de baja no cobra, así que tampoco tapa el hueco.
   */
  protected readonly faltaEquipoMarketing = computed(
    () =>
      this.vendedoras().length > 0 &&
      !this.vendedorasEnEquipo().some(v => v.area === 'PUBLICIDAD'),
  );

  /* ── Ocultar / devolver a los informes ─────────────────────────────────
   *
   * Ocultar pasa por un modal con motivo obligatorio —el backend rechaza la
   * petición sin él— porque el efecto es que una persona desaparece de la
   * planilla que se firma. Devolverla no pregunta nada: se vuelve al estado
   * normal, y el backend borra el motivo solo.
   */
  protected readonly vendedoraAOcultar = signal<Vendedora | null>(null);
  protected readonly motivoOculta = signal('');
  protected readonly ocultando = signal(false);
  /** Quién tiene un cambio de visibilidad en vuelo: solo SU botón se bloquea. */
  protected readonly visibilidadEnCurso = signal<string | null>(null);
  private readonly plantillaOcultar = viewChild<TemplateRef<unknown>>('modalOcultar');
  private overlayOcultar: OverlayRef | null = null;

  protected alternarVisibilidad(vendedora: Vendedora): void {
    if (!vendedora.oculta) {
      this.motivoOculta.set('');
      this.vendedoraAOcultar.set(vendedora);
      const tpl = this.plantillaOcultar();
      if (!tpl) return;
      this.overlayOcultar?.dispose();
      this.overlayOcultar = this.dialogService.openTemplate(tpl, this.vcr);
      this.overlayOcultar.backdropClick().subscribe(() => this.cerrarOcultar());
      return;
    }
    void this.devolverAInformes(vendedora);
  }

  protected cerrarOcultar(): void {
    this.vendedoraAOcultar.set(null);
    this.overlayOcultar?.dispose();
    this.overlayOcultar = null;
  }

  protected async confirmarOcultar(): Promise<void> {
    const vendedora = this.vendedoraAOcultar();
    const motivo = this.motivoOculta().trim();
    if (!vendedora || motivo.length < 3) return;

    this.ocultando.set(true);
    this.visibilidadEnCurso.set(vendedora.id);
    try {
      await this.service.actualizarVendedora(vendedora.id, { oculta: true, motivoOculta: motivo });
      this.toast.success(
        `${vendedora.nombre} ya no aparece en los informes. Sus ventas siguen contando.`,
        'Dada de baja',
      );
      this.vendedoraModificada.emit();
      this.cerrarOcultar();
    } catch (err) {
      this.toast.error(mensajeDeError(err, 'No se pudo ocultar a la vendedora.'), 'Error');
    } finally {
      this.ocultando.set(false);
      this.visibilidadEnCurso.set(null);
    }
  }

  private async devolverAInformes(vendedora: Vendedora): Promise<void> {
    this.visibilidadEnCurso.set(vendedora.id);
    try {
      await this.service.actualizarVendedora(vendedora.id, { oculta: false });
      this.toast.success(`${vendedora.nombre} vuelve a los informes.`, 'Reincorporada');
      this.vendedoraModificada.emit();
    } catch (err) {
      this.toast.error(mensajeDeError(err, 'No se pudo reincorporar a la vendedora.'), 'Error');
    } finally {
      this.visibilidadEnCurso.set(null);
    }
  }

  /* ── Alta manual de quien cobra sin vender ─────────────────────────────
   *
   * Todas las vendedoras se dan de alta solas al importar, porque cada fila del
   * Excel trae su `vendedora_pk`. El equipo de marketing no: no vende, así que
   * no tiene código en FileMaker ni aparece en ninguna fila — y sin embargo
   * cobra la mitad del pote de jefatura cada una. Sin este formulario la única
   * forma de meterlas era escribir en la base a mano.
   */
  protected readonly creandoVendedora = signal(false);
  protected readonly guardandoAlta = signal(false);
  protected readonly nuevoCodigo = signal('');
  protected readonly nuevoNombre = signal('');
  protected readonly nuevoTipo = signal<TipoVendedora>('VENDEDORA');
  protected readonly nuevaArea = signal<AreaVendedora>('PUBLICIDAD');
  protected readonly nuevoSueldo = signal('');
  private readonly plantillaAlta = viewChild<TemplateRef<unknown>>('modalAlta');
  private overlayAlta: OverlayRef | null = null;

  protected readonly altaValida = computed(
    () => this.nuevoCodigo().trim().length > 0 && this.nuevoNombre().trim().length > 0,
  );

  protected abrirAlta(): void {
    this.nuevoCodigo.set('');
    this.nuevoNombre.set('');
    this.nuevoTipo.set('VENDEDORA');
    /* Se preselecciona marketing porque es el único caso que NO puede darse de
       alta solo: una ejecutiva aparece en cuanto vende. */
    this.nuevaArea.set('PUBLICIDAD');
    this.nuevoSueldo.set('');
    this.creandoVendedora.set(true);

    const tpl = this.plantillaAlta();
    if (!tpl) return;
    this.overlayAlta?.dispose();
    this.overlayAlta = this.dialogService.openTemplate(tpl, this.vcr);
    this.overlayAlta.backdropClick().subscribe(() => this.cerrarAlta());
  }

  protected cerrarAlta(): void {
    this.creandoVendedora.set(false);
    this.overlayAlta?.dispose();
    this.overlayAlta = null;
  }

  protected async confirmarAlta(): Promise<void> {
    if (!this.altaValida()) return;

    const sueldoBase = Number(this.nuevoSueldo() || 0);
    if (!Number.isFinite(sueldoBase) || sueldoBase < 0) {
      this.toast.error('El sueldo base debe ser un número positivo.', 'Dato inválido');
      return;
    }

    this.guardandoAlta.set(true);
    try {
      const creada = await this.service.crearVendedora({
        codigo: this.nuevoCodigo().trim(),
        nombre: this.nuevoNombre().trim(),
        tipo: this.nuevoTipo(),
        area: this.nuevaArea(),
        sueldoBase,
      });
      this.toast.success(
        `${creada.nombre} entra en la planilla. Recalcula el mes para que aparezca.`,
        'Persona añadida',
      );
      this.cerrarAlta();
      this.vendedoraModificada.emit();
    } catch (err) {
      this.toast.error(mensajeDeError(err, 'No se pudo dar de alta.'), 'Error');
    } finally {
      this.guardandoAlta.set(false);
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

  protected guardarNombre(vendedora: Vendedora, valor: string): void {
    const nombre = valor.trim();
    if (!nombre) {
      this.toast.error('El nombre no puede quedar vacío.', 'Dato inválido');
      return;
    }
    if (nombre === vendedora.nombre) return;
    void this.guardarVendedora(vendedora, { nombre });
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
