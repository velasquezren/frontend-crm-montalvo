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

import { mensajeDeError } from '../../core/api/http-error';
import { AuthService } from '../../core/auth/auth.service';
import { paginaVacia, RespuestaPaginada } from '../../core/api/pagination.model';
import { ToastService } from '../../core/toast/toast.service';
import { DialogService } from '../../shared/components/dialog/dialog.service';
import { BadgeComponent } from '../../shared/components/badge/badge.component';
import { ButtonComponent } from '../../shared/components/button/button.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
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
  CanalVenta,
  ClasifComision,
  CLASIF_LABEL,
  ConfiguracionPlanilla,
  ESTADO_PERIODO_LABEL,
  GrupoPlanes,
  MESES,
  Objetivo,
  PeriodoComision,
  ReporteConsolidado,
  ResumenImportacion,
  TIPO_LABEL,
  TipoComision,
  TipoPlan,
  Vendedora,
  VentaImportada,
} from './planilla.model';

/** Etiquetas del filtro de canal — mismo criterio que `tarifaDe()`: cambia la
 *  tarifa aplicada (empresa vs. propia), así que conviene poder acotar por él. */
const CANAL_LABEL: Record<CanalVenta, string> = { EMPRESA: 'Empresa', PROPIO: 'Propio' };

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
    ConfiguracionComisionesComponent,
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
  protected readonly meses = MESES;
  protected readonly clasificaciones = Object.keys(CLASIF_LABEL) as ClasifComision[];
  protected readonly tipos = Object.keys(TIPO_LABEL) as TipoComision[];
  protected readonly canales = Object.keys(CANAL_LABEL) as CanalVenta[];
  protected readonly canalLabel = CANAL_LABEL;

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
  protected readonly filtroVendedora = signal<string | null>(null);

  /** Si hay algún filtro puesto, para que el pie no diga "del mes" cuando no lo es. */
  protected readonly hayFiltroActivo = computed(
    () =>
      Boolean(this.filtroClasif()) ||
      Boolean(this.filtroTipo()) ||
      Boolean(this.filtroCanal()) ||
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
  protected readonly configuracion = signal<ConfiguracionPlanilla | null>(null);

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
    this.filtroVendedora.set(null);
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
  protected alternarVendedora(id: string): void {
    this.filtroVendedora.update(actual => (actual === id ? null : id));
    this.pagina.set(1);
  }

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
        ? this.service.obtenerConsolidado(id).catch(() => null)
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
      this.consolidado.set(await this.service.obtenerConsolidado(id));
    } catch {
      this.consolidado.set(null);
    }
  }
}
