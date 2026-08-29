import { DatePipe, DecimalPipe } from '@angular/common';
import { httpResource } from '@angular/common/http';
import { OverlayRef } from '@angular/cdk/overlay';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  OnDestroy,
  signal,
  TemplateRef,
  ViewContainerRef,
  viewChild,
} from '@angular/core';

import { descargarArchivo } from '../../core/api/descargar-archivo';
import { mensajeDeError } from '../../core/api/http-error';
import { AuthService } from '../../core/auth/auth.service';
import { paginaVacia, RespuestaPaginada } from '../../core/api/pagination.model';
import { ToastService } from '../../core/toast/toast.service';
import { DialogService } from '../../shared/components/dialog/dialog.service';
import { BadgeComponent } from '../../shared/components/badge/badge.component';
import { ButtonComponent } from '../../shared/components/button/button.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { ErrorCargaComponent } from '../../shared/components/error-carga/error-carga.component';
import { FilterChipComponent } from '../../shared/components/filter-chip/filter-chip.component';
import { IconComponent } from '../../shared/components/icon/icon.component';
import { InfoHintComponent } from '../../shared/components/info-hint/info-hint.component';
import { InputComponent } from '../../shared/components/input/input.component';
import { KpiCardComponent } from '../../shared/components/kpi-card/kpi-card.component';
import { LoadingSkeletonComponent } from '../../shared/components/loading-skeleton/loading-skeleton.component';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { PaginatorComponent } from '../../shared/components/paginator/paginator.component';
import { SelectorPeriodoEmptyComponent } from '../../shared/components/selector-periodo-empty/selector-periodo-empty.component';
import { TableComponent } from '../../shared/components/table/table.component';
import { MonedaService } from '../../core/moneda/moneda.service';
import { MonedaPipe } from '../../shared/pipes/moneda.pipe';
import { SubtotalVendedora, TotalesVentas, PlanillaComisionesService } from './planilla-comisiones.service';
import { TablaLiquidacionComponent } from './components/tabla-liquidacion.component';
import { ConfiguracionComisionesComponent } from './components/configuracion-comisiones.component';
import { SeleccionPlanesComponent } from './components/seleccion-planes.component';
import {
  Alertas,
  CANAL_LABEL,
  CanalVenta,
  ClasifComision,
  CLASIF_LABEL,
  ConfiguracionPlanilla,
  ESTADO_PERIODO_AYUDA,
  ESTADO_PERIODO_BADGE,
  ESTADO_PERIODO_LABEL,
  etiquetaTipoFila,
  GrupoPlanes,
  MESES,
  Objetivo,
  PeriodoComision,
  ReporteConsolidado,
  ReporteDesglose,
  RevisionPeriodo,
  ResumenImportacion,
  TIPO_LABEL,
  TipoComision,
  TipoPlan,
  UNIDAD_LABEL,
  UnidadNegocio,
  Vendedora,
  VentaImportada,
} from './planilla.model';
import { DesgloseComisionesComponent } from './components/desglose-comisiones.component';

type Pestana = 'IMPORTAR' | 'CLASIFICACION' | 'PLANES' | 'REPORTES' | 'CONFIGURACION';

/**
 * Planilla de Comisiones — liquidación mensual del equipo comercial a partir
 * del Excel que exporta FileMaker.
 *
 * Flujo: subir/arrastrar el Excel → revisar cómo quedó clasificado → calcular → reportes.
 */
/** La página de ventas, con los totales del filtro entero que agrega el servidor. */
interface VentasConTotales extends RespuestaPaginada<VentaImportada> {
  readonly totales: TotalesVentas;
  readonly porVendedora: readonly SubtotalVendedora[];
}

/** El número dentro de un `Cod. Origen`: "VE1462" → 1462. */
function correlativo(codOrigen: string | null | undefined): number | null {
  if (!codOrigen) return null;
  const digitos = codOrigen.replace(/\D+/g, '');
  return digitos === '' ? null : Number(digitos);
}

/**
 * Ordena los planes del último registrado al primero, igual que el motor.
 *
 * Se compara el NÚMERO del correlativo, no el texto: como texto "VE999" iría
 * después de "VE1000" y el último plan del mes dejaría de serlo justo al cruzar
 * el millar. La fecha solo desempata cuando no hay correlativo, porque las dos
 * cosas se contradicen —en diciembre 2025 la venta VE1458 es del 22/12 y la
 * VE1462, posterior, del 13/12— y la planilla siempre siguió el correlativo.
 */
function ultimoPrimero(a: VentaImportada, b: VentaImportada): number {
  const ca = correlativo(a.codOrigen);
  const cb = correlativo(b.codOrigen);
  if (ca !== null && cb !== null && ca !== cb) return cb - ca;

  const fa = a.fecha ? Date.parse(a.fecha) : NaN;
  const fb = b.fecha ? Date.parse(b.fecha) : NaN;
  if (!Number.isNaN(fa) && !Number.isNaN(fb) && fa !== fb) return fb - fa;

  return b.id.localeCompare(a.id);
}

@Component({
  selector: 'app-planilla-comisiones',
  imports: [
    TablaLiquidacionComponent,
    DesgloseComisionesComponent,
    ConfiguracionComisionesComponent,
    ErrorCargaComponent,
    SeleccionPlanesComponent,
    DatePipe,
    DecimalPipe,
    MonedaPipe,
    BadgeComponent,
    ButtonComponent,
    EmptyStateComponent,
    FilterChipComponent,
    IconComponent,
    InfoHintComponent,
    InputComponent,
    KpiCardComponent,
    LoadingSkeletonComponent,
    PageHeaderComponent,
    PaginatorComponent,
    SelectorPeriodoEmptyComponent,
    TableComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './planilla-comisiones.page.html',
  styleUrl: './planilla-comisiones.page.css',
})
export class PlanillaComisionesPage implements OnDestroy {
  readonly embedded = input(false);

  private readonly service = inject(PlanillaComisionesService);
  private readonly toast = inject(ToastService);
  private readonly authService = inject(AuthService);
  private readonly dialogService = inject(DialogService);
  private readonly vcr = inject(ViewContainerRef);
  protected readonly monedaService = inject(MonedaService);

  /** Importar y borrar planillas queda reservado al super admin. */
  protected readonly esSuperAdmin = this.authService.isSuperAdmin;

  protected readonly clasifLabel = CLASIF_LABEL;
  protected readonly estadoLabel = ESTADO_PERIODO_LABEL;
  protected readonly tipoLabel = TIPO_LABEL;
  protected readonly unidadLabel = UNIDAD_LABEL;
  protected readonly etiquetaTipoFila = etiquetaTipoFila;
  protected readonly meses = MESES;
  protected readonly clasificaciones = Object.keys(CLASIF_LABEL) as ClasifComision[];
  protected readonly tipos = Object.keys(TIPO_LABEL) as TipoComision[];
  protected readonly canales = Object.keys(CANAL_LABEL) as CanalVenta[];
  protected readonly canalLabel = CANAL_LABEL;
  /* Maternidad primero porque es el grueso del volumen; RA al medio porque es
     el que administración pide aislar más seguido (ver `alternarUnidad`). */
  protected readonly unidades: UnidadNegocio[] = ['MATERNIDAD', 'RA', 'VARIOS'];

  /* ── Estado de UI ───────────────────────────────────────────────────── */

  protected readonly pestana = signal<Pestana>(
    this.authService.isSuperAdmin() ? 'IMPORTAR' : 'CLASIFICACION',
  );
  protected readonly periodoId = signal<string | null>(null);

  protected readonly subiendo = signal(false);
  protected readonly isDragging = signal(false);
  private dragCounter = 0;

  protected readonly calculando = signal(false);
  protected readonly ultimaImportacion = signal<ResumenImportacion | null>(null);

  protected readonly pagina = signal(1);
  protected readonly busqueda = signal('');
  protected readonly filtroClasif = signal<ClasifComision | null>(null);
  /* El tipo agrupa varias clasificaciones —A planes, B cirugías, C el resto—, así
     que revisar "todo lo que paga por Tipo B" no se podía con el filtro anterior. */
  protected readonly filtroTipo = signal<TipoComision | null>(null);
  /** EMPRESA/PROPIO. El backend ya lo soportaba y no había forma de acotarlo
   *  desde la interfaz: para ver "todo lo vendido por canal propio" había que
   *  contar a mano fila por fila. */
  protected readonly filtroCanal = signal<CanalVenta | null>(null);
  /** Maternidad / RA / Varios. Nace de que RA no tenía forma de aislarse: para
   *  verla completa había que scrollear las 200+ filas de consultas y
   *  análisis que arrastra ese área (ver la nota de `tarifaDe()`). */
  protected readonly filtroUnidad = signal<UnidadNegocio | null>(null);
  protected readonly filtroVendedora = signal<string | null>(null);
  /** Solo para el mensaje de "sin resultados" — ver `filtroVendedoraFantasma`. */
  protected readonly nombreFiltroVendedora = signal<string | null>(null);

  /** Si hay algún filtro puesto, para que el pie no diga "del mes" cuando no lo es. */
  protected readonly hayFiltroActivo = computed(
    () =>
      Boolean(this.filtroClasif()) ||
      Boolean(this.filtroTipo()) ||
      Boolean(this.filtroCanal()) ||
      Boolean(this.filtroUnidad()) ||
      Boolean(this.filtroVendedora()) ||
      Boolean(this.busquedaDebounced()) ||
      this.soloExcluidas() ||
      this.soloSinClasificar(),
  );
  protected readonly soloExcluidas = signal(false);
  protected readonly soloSinClasificar = signal(false);

  /** Búsqueda con retardo, para no pegarle al backend en cada tecla. */
  private readonly busquedaDebounced = signal('');

  protected readonly alertas = signal<Alertas | null>(null);
  protected readonly consolidado = signal<ReporteConsolidado | null>(null);

  /**
   * Si los informes de esta pantalla incluyen a las vendedoras dadas de baja.
   *
   * Arranca en `false`: para eso se las dio de baja. Es un interruptor y no una
   * casilla escondida en el diálogo de descarga porque **lo que se ve es lo que
   * se exporta** — el Excel usa este mismo valor. Tener dos controles distintos
   * (uno para la pantalla y otro para el archivo) es cómo se acaba descargando
   * un informe que no se parece al que se estaba mirando.
   *
   * El filtro lo aplica el SERVIDOR, así que cambiarlo vuelve a pedir el
   * consolidado y el desglose: los totales del pie tienen que seguir siendo la
   * suma exacta de las filas que se ven.
   */
  protected readonly incluirOcultas = signal(false);

  /* ── Cierre del mes ────────────────────────────────────────────────────
   *
   * El ciclo completo vive en el backend (`estados-periodo.ts`): qué salto es
   * legal, qué bloquea la revisión y cuándo se da por aprobada. Acá NO se
   * reimplementa ninguna de esas reglas — se piden y se pintan. Duplicar la
   * tabla de transiciones en la interfaz solo serviría para que un día las dos
   * copias digan cosas distintas y gane la que no manda.
   *
   * Lo único que decide esta página es qué botón ofrecer, y siempre como
   * conveniencia: el backend rechaza igual lo que no corresponda.
   */
  protected readonly revision = httpResource<RevisionPeriodo | undefined>(
    () => {
      const id = this.periodoId();
      return id && this.pestana() === 'REPORTES' ? this.service.revisionRequest(id) : undefined;
    },
    { defaultValue: undefined },
  );

  protected readonly estadoPeriodoLabel = ESTADO_PERIODO_LABEL;
  protected readonly estadoPeriodoBadge = ESTADO_PERIODO_BADGE;
  protected readonly estadoPeriodoAyuda = ESTADO_PERIODO_AYUDA;

  protected readonly enviandoARevision = signal(false);
  protected readonly aprobando = signal(false);
  protected readonly comentarioAprobacion = signal('');

  /** Rechazar y reabrir comparten modal: los dos piden lo mismo, un motivo. */
  protected readonly accionConMotivo = signal<'RECHAZAR' | 'REABRIR' | null>(null);
  protected readonly motivoAccion = signal('');
  protected readonly guardandoMotivo = signal(false);
  private readonly plantillaMotivo = viewChild<TemplateRef<unknown>>('modalMotivo');
  private overlayMotivo: OverlayRef | null = null;

  protected async enviarARevision(): Promise<void> {
    const id = this.periodoId();
    if (!id) return;

    this.enviandoARevision.set(true);
    try {
      await this.service.enviarARevision(id);
      this.toast.success(
        'El mes queda congelado hasta que se apruebe o se rechace.',
        'Enviado a revisión',
      );
      await this.refrescarCierre(id);
    } catch (err) {
      this.toast.error(mensajeDeError(err, 'No se pudo enviar a revisión.'), 'Error');
    } finally {
      this.enviandoARevision.set(false);
    }
  }

  protected async aprobar(): Promise<void> {
    const id = this.periodoId();
    if (!id) return;

    this.aprobando.set(true);
    try {
      const resultado = await this.service.aprobarPeriodo(id, this.comentarioAprobacion());
      /* El mensaje distingue los dos desenlaces porque desde la pantalla son
         indistinguibles: en los dos casos el botón desaparece. */
      if (resultado.cerrado) {
        this.toast.success('El mes queda cerrado con las cifras revisadas.', 'Cerrado');
      } else {
        this.toast.success(
          `Falta ${resultado.faltan.map(f => f.nombre).join(', ')} para cerrar el mes.`,
          'Aprobación registrada',
        );
      }
      this.comentarioAprobacion.set('');
      await this.refrescarCierre(id);
    } catch (err) {
      this.toast.error(mensajeDeError(err, 'No se pudo aprobar el periodo.'), 'Error');
    } finally {
      this.aprobando.set(false);
    }
  }

  protected async registrarPago(): Promise<void> {
    const id = this.periodoId();
    if (!id) return;

    try {
      await this.service.registrarPago(id);
      this.toast.success('El mes queda como pagado y ya no se modifica.', 'Pago registrado');
      await this.refrescarCierre(id);
    } catch (err) {
      this.toast.error(mensajeDeError(err, 'No se pudo registrar el pago.'), 'Error');
    }
  }

  protected abrirAccionConMotivo(accion: 'RECHAZAR' | 'REABRIR'): void {
    this.motivoAccion.set('');
    this.accionConMotivo.set(accion);
    const tpl = this.plantillaMotivo();
    if (!tpl) return;
    this.overlayMotivo?.dispose();
    this.overlayMotivo = this.dialogService.openTemplate(tpl, this.vcr);
    this.overlayMotivo.backdropClick().subscribe(() => this.cerrarAccionConMotivo());
  }

  protected cerrarAccionConMotivo(): void {
    this.accionConMotivo.set(null);
    this.overlayMotivo?.dispose();
    this.overlayMotivo = null;
  }

  protected async confirmarAccionConMotivo(): Promise<void> {
    const id = this.periodoId();
    const accion = this.accionConMotivo();
    const motivo = this.motivoAccion().trim();
    if (!id || !accion || motivo.length < 3) return;

    this.guardandoMotivo.set(true);
    try {
      if (accion === 'RECHAZAR') {
        await this.service.rechazarPeriodo(id, motivo);
        this.toast.success('El mes vuelve a edición y se borran las aprobaciones.', 'Rechazado');
      } else {
        await this.service.reabrirPeriodo(id, motivo);
        this.toast.success('El mes vuelve a edición. Queda registrado quién y por qué.', 'Reabierto');
      }
      this.cerrarAccionConMotivo();
      await this.refrescarCierre(id);
    } catch (err) {
      this.toast.error(mensajeDeError(err, 'No se pudo completar la acción.'), 'Error');
    } finally {
      this.guardandoMotivo.set(false);
    }
  }

  /**
   * Tras un cambio de estado hay que refrescar TODO lo que depende de él: el
   * panel de cierre, el periodo (que pinta el badge de la barra superior) y las
   * alertas. Sin el `periodos.reload()` la cabecera seguía diciendo "Calculado"
   * sobre un mes ya cerrado.
   */
  private async refrescarCierre(id: string): Promise<void> {
    this.revision.reload();
    this.periodos.reload();
    await this.refrescarPanelesDelPeriodo(id);
  }
  protected readonly configuracion = signal<ConfiguracionPlanilla | null>(null);
  protected readonly descargandoExcel = signal(false);

  private readonly preventDefaultDrag = (e: DragEvent) => e.preventDefault();

  constructor() {
    // Evita que el navegador navegue o abra el archivo si se suelta fuera de la zona
    if (typeof window !== 'undefined') {
      window.addEventListener('dragover', this.preventDefaultDrag);
      window.addEventListener('drop', this.preventDefaultDrag);
    }

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

    /*
     * Esta pantalla convierte con el TC de SU periodo, no con el global.
     *
     * Las cifras en bolivianos que muestra son las que el backend liquidó
     * multiplicando por el tipo de cambio de ese mes concreto. Pasarlas a
     * dólares dividiendo por el de otro mes daría un número que no cuadra con la
     * liquidación que administración tiene delante. Al salir se restaura el
     * global en `ngOnDestroy`.
     */
    effect(() => {
      const tc = Number(this.periodoActual()?.tipoCambio);
      if (tc > 0) this.monedaService.setTipoCambio(tc);
    });
  }

  ngOnDestroy(): void {
    this.monedaService.restaurarTipoCambioGlobal();
    if (typeof window !== 'undefined') {
      window.removeEventListener('dragover', this.preventDefaultDrag);
      window.removeEventListener('drop', this.preventDefaultDrag);
    }
  }

  /* ── Recursos ───────────────────────────────────────────────────────── */

  protected readonly periodos = httpResource<RespuestaPaginada<PeriodoComision>>(
    () => this.service.periodosRequest(),
    { defaultValue: paginaVacia<PeriodoComision>() },
  );

  protected readonly ventas = httpResource<VentasConTotales>(
    () => {
      const id = this.periodoId();
      if (!id) return undefined;
      return this.service.ventasRequest(id, {
        pagina: this.pagina(),
        clasif: this.filtroClasif() ?? undefined,
        tipo: this.filtroTipo() ?? undefined,
        canal: this.filtroCanal() ?? undefined,
        unidadNegocio: this.filtroUnidad() ?? undefined,
        vendedoraId: this.filtroVendedora() ?? undefined,
        buscar: this.busquedaDebounced() || undefined,
        soloExcluidas: this.soloExcluidas(),
        soloSinClasificar: this.soloSinClasificar(),
      });
    },
    /* El vacío también trae totales en cero: así la plantilla nunca tiene que
       preguntar si existen, y el pie muestra 0 en vez de parpadear. */
    {
      defaultValue: {
        ...paginaVacia<VentaImportada>(),
        totales: { ventas: 0, monto: 0, base: 0 },
        porVendedora: [],
      },
    },
  );

  /*
   * Planes del periodo, en una sola página. La decisión de qué plan comisiona
   * se toma mirando TODOS los planes de la vendedora juntos, así que partirlos
   * en páginas haría imposible compararlos.
   *
   * Se piden 100, que es el tope que admite la paginación del backend
   * (`LIMITE_MAXIMO`). Sobra: el mes más cargado de 2026 trae 30 planes. Pedir
   * más devuelve 400 y la vista muestra el error de carga — que es exactamente
   * lo que pasaba pidiendo 200.
   */
  /** Solo se pide en la pestaña Reportes, y solo cuando ya hay periodo — el
   *  desglose de un mes sin calcular no existe todavía. */
  protected readonly desglose = httpResource<ReporteDesglose>(
    () => {
      const id = this.periodoId();
      return id && this.pestana() === 'REPORTES'
        ? this.service.desgloseRequest(id, this.incluirOcultas())
        : undefined;
    },
    { defaultValue: { filas: [] } },
  );

  protected readonly planesPaq = httpResource<RespuestaPaginada<VentaImportada>>(
    () => {
      const id = this.periodoId();
      return id && this.pestana() === 'PLANES'
        ? this.service.ventasRequest(id, { clasif: 'PLANPAQ', limite: 100 })
        : undefined;
    },
    { defaultValue: paginaVacia<VentaImportada>() },
  );

  protected readonly planesNin = httpResource<RespuestaPaginada<VentaImportada>>(
    () => {
      const id = this.periodoId();
      return id && this.pestana() === 'PLANES'
        ? this.service.ventasRequest(id, { clasif: 'PLANNIN', limite: 100 })
        : undefined;
    },
    { defaultValue: paginaVacia<VentaImportada>() },
  );

  /**
   * Los planes agrupados por vendedora y tipo, con el cupo ya resuelto.
   *
   * El cupo es `vendidos − objetivo`: solo comisionan los planes que SUPERAN el
   * objetivo, así que con 8 paquetes y objetivo 6 comisionan los 2 ÚLTIMOS. Se
   * marca cuál comisiona reproduciendo el orden que usa el motor —correlativo de
   * registro descendente—, para que lo que se ve en pantalla sea lo que se paga.
   *
   * Es la misma regla escrita dos veces, y eso es una deuda conocida: si cambia
   * `seleccionarPlanesComisionables` en el backend hay que cambiarla aquí, o la
   * pantalla mostrará marcados unos planes y la liquidación pagará otros.
   */
  protected readonly gruposDePlanes = computed<GrupoPlanes[]>(() => {
    const objetivos: readonly Objetivo[] = this.configuracion()?.objetivos ?? [];
    const porVendedora = new Map<string, GrupoPlanes>();

    const agregar = (venta: VentaImportada, tipo: TipoPlan): void => {
      if (!venta.vendedora) return;
      const clave = `${venta.vendedora.id}·${tipo}`;
      const grupo = porVendedora.get(clave) ?? {
        clave,
        vendedoraId: venta.vendedora.id,
        vendedoraNombre: venta.vendedora.nombre,
        tipo,
        objetivo: 0,
        cupo: 0,
        planes: [],
      };
      grupo.planes.push(venta);
      porVendedora.set(clave, grupo);
    };

    for (const venta of this.planesPaq.value().datos) agregar(venta, 'PLANPAQ');
    for (const venta of this.planesNin.value().datos) agregar(venta, 'PLANNIN');

    const vendedorasPorId = new Map(this.vendedoras.value().map(v => [v.id, v]));

    return [...porVendedora.values()]
      .map(grupo => {
        const vendedora = vendedorasPorId.get(grupo.vendedoraId);
        const meta = objetivos.find(objetivo => objetivo.tipo === (vendedora?.tipo ?? 'VENDEDORA'));
        const objetivo =
          grupo.tipo === 'PLANPAQ' ? (meta?.planpaqMinimos ?? 0) : (meta?.planninMinimos ?? 0);

        // Mismo orden que usa el motor: del último registrado al primero.
        const planes = [...grupo.planes].sort(ultimoPrimero);
        const cupo = Math.max(0, planes.length - objetivo);

        // Reproduce la selección del backend: lo marcado a mano primero.
        const elegidos = new Set<string>();
        for (const plan of planes) {
          if (plan.comisionaPlan === true && elegidos.size < cupo) elegidos.add(plan.id);
        }
        for (const plan of planes) {
          if (elegidos.size >= cupo) break;
          if ((plan.comisionaPlan ?? null) === null) elegidos.add(plan.id);
        }

        return { ...grupo, objetivo, cupo, planes, elegidos };
      })
      .sort((a, b) => a.vendedoraNombre.localeCompare(b.vendedoraNombre) || a.tipo.localeCompare(b.tipo));
  });

  protected readonly vendedoras = httpResource<Vendedora[]>(
    () => this.service.vendedorasRequest(),
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

  /**
   * Cuántas filas hay por unidad de negocio, del mes entero — para pintar el
   * número en cada chip ANTES de tocarlo. Un mapa y no un array: se consulta
   * por clave en la plantilla, una vez por chip, sin `find()` en cada change
   * detection.
   */
  protected readonly conteoPorUnidad = computed(() => {
    const mapa = new Map<UnidadNegocio, number>();
    for (const fila of this.alertas()?.porUnidadNegocio ?? []) mapa.set(fila.unidadNegocio, fila.filas);
    return mapa;
  });

  protected readonly conteoPorClasif = computed(() => {
    const mapa = new Map<ClasifComision, number>();
    for (const fila of this.alertas()?.porClasif ?? []) mapa.set(fila.clasif, fila.filas);
    return mapa;
  });

  protected readonly conteoPorTipo = computed(() => {
    const mapa = new Map<TipoComision, number>();
    for (const fila of this.alertas()?.porTipo ?? []) mapa.set(fila.tipo, fila.filas);
    return mapa;
  });

  /* ── Acciones Drag & Drop / Selección de Archivo ─────────────────────── */

  /**
   * Marca o desmarca un plan. Tres estados en un solo botón: automático →
   * comisiona → no comisiona → automático. El backend recalcula al liquidar.
   */
  protected async alternarPlan(plan: VentaImportada): Promise<void> {
    /*
     * `?? null` no es decorativo: si el backend no conoce todavía el campo lo
     * omite del JSON y llega `undefined`, no `null`. Sin normalizar, el ciclo
     * calculaba `null` para ese caso y el botón guardaba el mismo valor que ya
     * tenía — se veía como que el clic no hacía nada.
     */
    const actual = plan.comisionaPlan ?? null;
    const siguiente = actual === null ? true : actual ? false : null;

    /*
     * Optimista, y aquí no es un lujo: `reload()` de los dos recursos ponía
     * `isLoading()` en true y la plantilla sustituye la lista ENTERA por un
     * esqueleto mientras carga. Cada toque hacía parpadear toda la sección —
     * dos veces, una por recurso— para cambiar una insignia de una fila.
     *
     * No hace falta ir al servidor para saber el resultado: `gruposDePlanes()`
     * ya reproduce en memoria el mismo criterio de cupo que aplica el motor al
     * liquidar, así que con actualizar el valor local la vista queda idéntica a
     * lo que devolvería la recarga, y al instante.
     */
    const previoPaq = this.planesPaq.value();
    const previoNin = this.planesNin.value();

    const parchear = (pagina: RespuestaPaginada<VentaImportada>) => ({
      ...pagina,
      datos: pagina.datos.map(v => (v.id === plan.id ? { ...v, comisionaPlan: siguiente } : v)),
    });
    this.planesPaq.set(parchear(previoPaq));
    this.planesNin.set(parchear(previoNin));

    try {
      await this.service.marcarPlanComisiona(plan.id, siguiente);
    } catch (err) {
      /* Rollback: la insignia vuelve sola a donde estaba. */
      this.planesPaq.set(previoPaq);
      this.planesNin.set(previoNin);
      this.toast.error(mensajeDeError(err, 'No se pudo cambiar el plan.'), 'Planes');
    }
  }

  protected setPestana(p: Pestana): void {
    this.pestana.set(p);
    /* La columna "Tarifa" de Clasificación sale de la configuración, y esta solo
       se cargaba al abrir la pestaña Configuración: sin ella, `tarifaDe()`
       devolvía "—" en TODAS las filas y parecía que ninguna venta tenía tarifa.
       Se pide una sola vez; si ya está, no vuelve a viajar. */
    if ((p === 'CLASIFICACION' || p === 'PLANES') && !this.configuracion()) {
      void this.cargarConfiguracion();
    }
    if (p === 'REPORTES' && !this.consolidado()) {
      const id = this.periodoId();
      if (id) void this.cargarConsolidado(id);
    }
  }

  protected seleccionarPeriodo(id: string): void {
    this.periodoId.set(id);
    this.pagina.set(1);
  }

  /** Selecciona el periodo y entra directamente a la auditoría de ventas. */
  protected abrirPeriodo(id: string): void {
    this.seleccionarPeriodo(id);
    this.setPestana('CLASIFICACION');
  }

  protected nombreMes(mes: number): string {
    return this.meses[mes - 1] ?? String(mes);
  }

  /** Sube el Excel elegido en el input de archivo. */
  protected async subirArchivo(evento: Event): Promise<void> {
    const input = evento.target as HTMLInputElement;
    const archivo = input.files?.[0];
    if (!archivo) return;
    await this.procesarArchivo(archivo);
    input.value = '';
  }

  /** Manejadores de Drag and Drop sin parpadeos */
  protected onDragEnter(e: DragEvent): void {
    e.preventDefault();
    this.dragCounter++;
    if (this.dragCounter === 1 && !this.subiendo()) {
      this.isDragging.set(true);
    }
  }

  protected onDragOver(e: DragEvent): void {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'copy';
    }
  }

  protected onDragLeave(e: DragEvent): void {
    e.preventDefault();
    e.stopPropagation();
    this.dragCounter--;
    if (this.dragCounter <= 0) {
      this.dragCounter = 0;
      this.isDragging.set(false);
    }
  }

  protected onDrop(e: DragEvent): void {
    e.preventDefault();
    e.stopPropagation();
    this.dragCounter = 0;
    this.isDragging.set(false);
    if (this.subiendo()) return;

    const archivo = e.dataTransfer?.files?.[0];
    if (archivo) {
      void this.procesarArchivo(archivo);
    }
  }

  /** Procesa la importación del archivo cargado o arrastrado. */
  protected async procesarArchivo(archivo: File): Promise<void> {
    if (!archivo.name.endsWith('.xlsx') && !archivo.name.endsWith('.xls')) {
      this.toast.error('Por favor selecciona o arrastra un archivo de Excel (.xlsx o .xls).', 'Formato no válido');
      return;
    }

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
    }
  }

  /**
   * Pedir confirmación antes de rehacer un periodo ya calculado.
   *
   * Recalcular pisa los resultados con la configuración que haya AHORA, y las
   * tarifas y parámetros son globales: pueden haber cambiado desde el cálculo
   * anterior sin que nadie lo relacione con este mes. Un clic de más en un mes
   * ya revisado devolvía otros números sin avisar.
   *
   * La primera vez no pregunta: no hay nada que sobrescribir.
   */
  protected readonly confirmandoCalculo = signal(false);

  protected pedirCalculo(): void {
    if (this.periodoActual()?.estado === 'CALCULADO') {
      this.confirmandoCalculo.set(true);
      return;
    }
    void this.calcular();
  }

  protected cancelarCalculo(): void {
    this.confirmandoCalculo.set(false);
  }

  protected async calcular(): Promise<void> {
    const id = this.periodoId();
    this.confirmandoCalculo.set(false);
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

  /* ── Quitar o devolver la comisión de una fila ─────────────────────────
   *
   * El backend exige motivo al excluir y lo guarda en la auditoría, así que la
   * decisión queda rastreable: dentro de tres meses se puede saber quién sacó
   * esa venta del cálculo y por qué. Reincluir no pide nada y borra el motivo.
   */
  protected readonly ventaAExcluir = signal<VentaImportada | null>(null);
  protected readonly motivoExclusion = signal('');
  protected readonly excluyendo = signal(false);
  private readonly plantillaExcluir = viewChild<TemplateRef<unknown>>('modalExcluir');
  private overlayExcluir: OverlayRef | null = null;

  protected alternarComisionable(venta: VentaImportada): void {
    if (venta.comisionable) {
      this.motivoExclusion.set('');
      this.ventaAExcluir.set(venta);
      const tpl = this.plantillaExcluir();
      if (!tpl) return;
      this.overlayExcluir?.dispose();
      this.overlayExcluir = this.dialogService.openTemplate(tpl, this.vcr);
      this.overlayExcluir.backdropClick().subscribe(() => this.cerrarExcluir());
      return;
    }
    /* Devolverla al cálculo no necesita explicación: se vuelve al estado que el
       propio sistema había decidido. */
    void this.guardarComisionable(venta, true);
  }

  protected cerrarExcluir(): void {
    this.ventaAExcluir.set(null);
    this.overlayExcluir?.dispose();
    this.overlayExcluir = null;
  }

  protected async confirmarExclusion(): Promise<void> {
    const venta = this.ventaAExcluir();
    const motivo = this.motivoExclusion().trim();
    if (!venta || motivo.length < 3) return;
    await this.guardarComisionable(venta, false, motivo);
    this.cerrarExcluir();
  }

  private async guardarComisionable(
    venta: VentaImportada,
    comisionable: boolean,
    motivoExclusion?: string,
  ): Promise<void> {
    this.excluyendo.set(true);
    try {
      await this.service.ajustarVenta(venta.id, { comisionable, motivoExclusion });
      this.toast.success(
        comisionable ? `"${venta.detalle}" vuelve al cálculo.` : `"${venta.detalle}" ya no comisiona.`,
        comisionable ? 'Comisión devuelta' : 'Comisión retirada',
      );
      this.ventas.reload();
      const id = this.periodoId();
      if (id) await this.refrescarPanelesDelPeriodo(id);
    } catch (err) {
      this.toast.error(mensajeDeError(err, 'No se pudo cambiar la fila.'), 'Error');
    } finally {
      this.excluyendo.set(false);
    }
  }

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
      const regla = await this.service.crearRegla({ patron: detalle, clasif, prioridad: 50 });
      /* La regla se aplica de inmediato a lo YA importado que seguía sin
         clasificar (backend: `reclasificarConRegla`) — no hace falta
         reimportar. Recalcular alcanza para que se refleje en la liquidación. */
      const mensaje =
        regla.filasActualizadas > 0
          ? `"${detalle}" se clasificó como ${this.clasifLabel[clasif]} en ${regla.filasActualizadas} ` +
            `fila${regla.filasActualizadas === 1 ? '' : 's'} ya importada${regla.filasActualizadas === 1 ? '' : 's'}. ` +
            'Recalcula la planilla para que se refleje en la liquidación.'
          : `A partir de ahora "${detalle}" se clasificará como ${this.clasifLabel[clasif]}.`;
      this.toast.success(mensaje, 'Regla creada');
      await this.cargarConfiguracion();
      // Las filas que se acaban de reclasificar ya no deberían salir en
      // "Servicios no reconocidos" — sin esto, el aviso seguía mostrando el
      // caso ya resuelto hasta la próxima navegación.
      const id = this.periodoId();
      if (id) await this.refrescarPanelesDelPeriodo(id);
    } catch (err) {
      this.toast.error(mensajeDeError(err, 'No se pudo crear la regla.'), 'Error');
    }
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

  protected async recargarVendedoras(): Promise<void> {
    this.vendedoras.reload();
    const id = this.periodoId();
    if (id) await this.refrescarPanelesDelPeriodo(id);
  }

  protected limpiarFiltros(): void {
    this.busqueda.set('');
    this.filtroClasif.set(null);
    this.filtroTipo.set(null);
    this.filtroCanal.set(null);
    this.filtroUnidad.set(null);
    this.filtroVendedora.set(null);
    this.nombreFiltroVendedora.set(null);
    this.soloExcluidas.set(false);
    this.soloSinClasificar.set(false);
    this.pagina.set(1);
  }

  protected filtrarPorClasif(valor: string): void {
    this.filtroClasif.set(valor ? (valor as ClasifComision) : null);
    this.pagina.set(1);
  }

  /** Alternar: pulsar el canal ya activo vuelve a "Todos". */
  protected filtrarPorCanal(valor: CanalVenta): void {
    this.filtroCanal.update(actual => (actual === valor ? null : valor));
    this.pagina.set(1);
  }

  /** Alterna la unidad de negocio: pulsar la ya activa la suelta, igual que
   *  `alternarVendedora` con la tarjeta de un agente. */
  protected alternarUnidad(unidad: UnidadNegocio): void {
    this.filtroUnidad.update(actual => (actual === unidad ? null : unidad));
    this.pagina.set(1);
  }

  /**
   * Qué se le aplica a esta fila, según la configuración vigente.
   *
   * Existe porque cambiar el canal de una venta "no hacía nada": sí lo hace,
   * pero la diferencia es de céntimos y la tabla no mostraba nada por fila. Una
   * consulta de base $31,21 pasa de 4,5% ($1,40) a 5,5% ($1,72) — 32 centavos,
   * invisibles en un total de miles. Mostrando el porcentaje, el efecto del
   * cambio se ve en el momento.
   *
   * Las cirugías dependen del nivel, que sale del ACUMULADO del mes de esa
   * vendedora y no de la fila, así que ahí se dice de qué depende en vez de
   * inventar un número. Las RA pagan tarifa fija por procedimiento, no
   * porcentaje.
   */
  /**
   * De dónde sale la base de cálculo de esta fila.
   *
   * La base se obtiene de dos maneras y el número solo no distingue cuál: en un
   * cobro de plan es el anticipo tal cual, y en el resto es el precio menos el
   * 13 %. Sin decirlo, dos filas seguidas parecen incoherentes —una baja de
   * 3.532 a 1.787 y la de al lado se queda igual— y no hay forma de saber si es
   * correcto o un error de importación. Lo era: la primera pagó una cuota y la
   * segunda pagó el paquete entero.
   */
  protected tieneAnticipo(venta: VentaImportada): boolean {
    return Number(venta.anticipoPlan ?? 0) > 0;
  }

  /**
   * Qué parte del plan lleva pagado la paciente.
   *
   * **Es informativo: no entra en la comisión.** La base sale siempre del precio
   * menos el 13 %, cobre lo que cobre — verificado sobre las 356 filas de
   * diciembre. Se muestra porque a administración le sirve ver quién va al día y
   * quién debe, no porque cambie lo que se paga.
   *
   * Por encima de 100 no se recorta a propósito: son cobros por encima del precio
   * de catálogo y conviene que salten a la vista (hay cinco en enero).
   */
  protected porcentajeAnticipo(venta: VentaImportada): number | null {
    const anticipo = Number(venta.anticipoPlan ?? 0);
    const precio = Number(venta.precio ?? 0);
    if (anticipo <= 0 || precio <= 0) return null;
    return Math.round((anticipo / precio) * 100);
  }

  protected tarifaDe(venta: VentaImportada): string {
    const cfg = this.configuracion();
    if (!cfg) return '—';
    const propio = venta.canal === 'PROPIO';

    if (venta.clasif === 'CIRUGIA') return 'según nivel';

    /*
     * Área RA. Decía "sin tarifa RA", que se lee como "falta configurar algo", y
     * era falso: las ventas del área RA NO comisionan a las ejecutivas —solo a
     * la coordinadora RA, regla 5 de casos borde, con PCT_TIPO_C_RA en 0—.
     *
     * Lo que hay ahí son análisis y consultas que pide la unidad de
     * reproducción, atribuidos a la ejecutiva: en enero, las 198 filas RA eran
     * hemogramas, creatininas, glicemias y consultas. Las 10 tarifas RA
     * configuradas son procedimientos de la coordinadora —transferencias,
     * aspiración de óvulos, inseminación—, así que ninguna cruza con un
     * hemograma, y eso está bien.
     */
    if (venta.unidadNegocio === 'RA') {
      const ra = cfg.tarifasRA.find(t => t.procedimiento === venta.detalle);
      if (!ra) return 'sin % directo · RA';
      const monto = Number(propio ? ra.montoPropio : ra.montoEmpresa);
      return ra.esPorcentaje ? `${monto}%` : `$${monto.toFixed(2)} fijo`;
    }

    if (venta.clasif === 'PLANPAQ' || venta.clasif === 'PLANNIN') {
      const clave = venta.clasif === 'PLANNIN' ? 'PLANNIN' : (venta.nivel ?? 'SILVER');
      const tp = cfg.tarifasPlan.find(t => t.clave === clave);
      if (!tp) return '—';
      return `${Number(propio ? tp.pctPropio : tp.pctEmpresa)}%`;
    }

    const ts = cfg.tarifasServicio.find(t => t.clasif === venta.clasif);
    if (!ts) return '—';
    return `${Number(propio ? ts.pctPropio : ts.pctEmpresa)}%`;
  }

  /** Pulsar la tarjeta de un agente acota la tabla a sus ventas, y volver a
   *  pulsarla la suelta. Es el gesto que esperaba administración: ver el total
   *  de alguien y entrar a su detalle sin buscar en un desplegable. */
  protected alternarVendedora(id: string, nombre: string): void {
    const yaElegida = this.filtroVendedora() === id;
    this.filtroVendedora.set(yaElegida ? null : id);
    this.nombreFiltroVendedora.set(yaElegida ? null : nombre);
    this.pagina.set(1);
  }

  /**
   * Deja el filtro de vendedora sin tocar el resto — para el botón del aviso
   * "sin ventas para esta vendedora" (`filtroVendedoraFantasma`).
   */
  protected quitarFiltroVendedora(): void {
    this.filtroVendedora.set(null);
    this.nombreFiltroVendedora.set(null);
    this.pagina.set(1);
  }

  /**
   * `whereSinVendedora` del backend (`listarVentas`) calcula el resumen por
   * agente SIN el filtro de vendedora, a propósito, para que el selector no
   * dependa de sí mismo. Consecuencia: elegir una vendedora y DESPUÉS acotar
   * por otro filtro (clasif/tipo/canal/unidad/búsqueda) bajo el que ya no
   * tiene ninguna venta deja la tabla vacía, mientras el resumen sigue
   * mostrando a las demás — parece que hay datos pero la tabla dice que no
   * hay ninguno, y la tarjeta de la elegida ni siquiera sigue en el resumen
   * para poder deseleccionarla a mano.
   *
   * En vez de corregirlo solo en segundo plano (esa versión pedía una
   * petición de red EXTRA cada vez, y se sentía más lento) esto solo lee
   * `porVendedora` de la respuesta que YA llegó — cero peticiones de más — y
   * la plantilla usa el resultado para explicarlo y ofrecer un botón, no
   * para adivinar ni recalcular nada.
   */
  protected readonly filtroVendedoraFantasma = computed(() => {
    const id = this.filtroVendedora();
    if (!id || this.ventas.isLoading()) return false;
    return !this.ventas.value().porVendedora.some(a => a.vendedoraId === id);
  });

  protected filtrarPorTipo(valor: string): void {
    this.filtroTipo.set(valor ? (valor as TipoComision) : null);
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

  /** Recarga alertas (y consolidado si ya estaba activo o en la pestaña REPORTES). */
  private async refrescarPanelesDelPeriodo(id: string): Promise<void> {
    const tareas: [Promise<Alertas>, Promise<ReporteConsolidado | null>] = [
      this.service.obtenerAlertas(id),
      this.pestana() === 'REPORTES' || this.consolidado() !== null
        ? this.service.obtenerConsolidado(id, this.incluirOcultas()).catch(() => null)
        : Promise.resolve(null),
    ];

    const [alertas, consolidado] = await Promise.allSettled(tareas);

    this.alertas.set(alertas.status === 'fulfilled' ? alertas.value : null);
    if (consolidado.status === 'fulfilled' && consolidado.value !== null) {
      this.consolidado.set(consolidado.value);
    }
  }

  private async cargarConsolidado(id: string): Promise<void> {
    try {
      this.consolidado.set(await this.service.obtenerConsolidado(id, this.incluirOcultas()));
    } catch {
      this.consolidado.set(null);
    }
  }

  /**
   * Muestra u oculta a las vendedoras dadas de baja en los informes del mes.
   *
   * Vuelve a pedir el consolidado en vez de filtrar lo que ya está en memoria:
   * los totales los calcula el servidor sobre las filas que devuelve, y
   * recortarlos aquí obligaría a re-sumar las doce columnas de dinero por
   * nuestra cuenta — el desglose se recarga solo, porque lee este signal.
   */
  protected async alternarOcultas(): Promise<void> {
    this.incluirOcultas.update(v => !v);
    const id = this.periodoId();
    if (id) await this.cargarConsolidado(id);
  }

  /**
   * Descarga el Excel completo del periodo ACTIVO: el mismo resumen que la
   * pantalla, más lo que la tabla web no puede mostrar por falta de ancho —
   * el desglose por tipo y sección y cada venta del mes, en una hoja aparte
   * por vendedora. Botón de la barra superior, visible en cualquier
   * pestaña — antes vivía escondido dentro de "Planilla por Persona", en
   * Reportes, y había que entrar ahí para encontrarlo.
   */
  protected descargarExcel(): Promise<void> {
    const periodo = this.periodoActual();
    return periodo ? this.descargarExcelDe(periodo) : Promise.resolve();
  }

  /**
   * Un periodo cualquiera, no necesariamente el activo — botón por fila en
   * "Planillas cargadas en el sistema" (pestaña Importar): antes había que
   * abrir cada mes para descargar el suyo; ahora se puede desde el
   * histórico directamente.
   */
  protected readonly descargandoPdf = signal(false);

  /**
   * El informe firmable del periodo activo.
   *
   * Respeta el mismo interruptor de "incluir dadas de baja" que el Excel y la
   * pantalla: lo que se ve es lo que se imprime. Un PDF que no coincidiera con
   * la tabla de arriba sería peor que no tenerlo, porque es el que se archiva.
   */
  protected async descargarPdf(): Promise<void> {
    const periodo = this.periodoActual();
    if (!periodo || this.descargandoPdf()) return;

    this.descargandoPdf.set(true);
    try {
      const { blob, nombre } = await this.service.descargarPdf(
        periodo.id,
        periodo.anio,
        periodo.mes,
        this.incluirOcultas(),
      );
      descargarArchivo(blob, nombre);
      this.toast.success(`${nombre} descargado.`, 'Informe listo');
    } catch (err) {
      this.toast.error(mensajeDeError(err, 'No se pudo generar el informe PDF.'), 'Error');
    } finally {
      this.descargandoPdf.set(false);
    }
  }

  protected async descargarExcelDe(periodo: PeriodoComision): Promise<void> {
    if (this.descargandoExcel()) return;

    this.descargandoExcel.set(true);
    try {
      const { blob, nombre } = await this.service.descargarExcel(
        periodo.id,
        periodo.anio,
        periodo.mes,
        this.incluirOcultas(),
      );
      descargarArchivo(blob, nombre);
      this.toast.success(`${nombre} descargado.`, 'Excel listo');
    } catch (err) {
      this.toast.error(mensajeDeError(err, 'No se pudo generar el Excel.'), 'Error');
    } finally {
      this.descargandoExcel.set(false);
    }
  }
}
