import { DatePipe, DecimalPipe } from '@angular/common';
import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, OnDestroy, signal } from '@angular/core';

import { mensajeDeError } from '../../core/api/http-error';
import { AuthService } from '../../core/auth/auth.service';
import { paginaVacia, RespuestaPaginada } from '../../core/api/pagination.model';
import { ToastService } from '../../core/toast/toast.service';
import { BadgeComponent } from '../../shared/components/badge/badge.component';
import { ButtonComponent } from '../../shared/components/button/button.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { FilterChipComponent } from '../../shared/components/filter-chip/filter-chip.component';
import { IconComponent } from '../../shared/components/icon/icon.component';
import { InfoHintComponent } from '../../shared/components/info-hint/info-hint.component';
import { InputComponent } from '../../shared/components/input/input.component';
import { LoadingSkeletonComponent } from '../../shared/components/loading-skeleton/loading-skeleton.component';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { PaginatorComponent } from '../../shared/components/paginator/paginator.component';
import { SelectorPeriodoEmptyComponent } from '../../shared/components/selector-periodo-empty/selector-periodo-empty.component';
import { TableComponent } from '../../shared/components/table/table.component';
import { MonedaPipe } from '../../shared/pipes/moneda.pipe';
import { PlanillaComisionesService } from './planilla-comisiones.service';
import { TablaLiquidacionComponent } from './components/tabla-liquidacion.component';
import {
  Alertas,
  ClasifComision,
  CLASIF_LABEL,
  ConfiguracionPlanilla,
  ESTADO_PERIODO_LABEL,
  MapeoCaptacion,
  MESES,
  Objetivo,
  PeriodoComision,
  ReporteConsolidado,
  ResumenImportacion,
  TIPO_LABEL,
  CambiosVendedora,
  TipoVendedora,
  Vendedora,
  VentaImportada,
} from './planilla.model';

type Pestana = 'IMPORTAR' | 'CLASIFICACION' | 'PLANES' | 'REPORTES' | 'CONFIGURACION';

/** Los dos tipos de plan que tienen objetivo propio. */
type TipoPlan = 'PLANPAQ' | 'PLANNIN';

/** Los planes de una vendedora de un tipo, con su objetivo y su cupo resueltos. */
interface GrupoPlanes {
  clave: string;
  vendedoraId: string;
  vendedoraNombre: string;
  tipo: TipoPlan;
  /** Cuántos hay que superar para que empiecen a comisionar. */
  objetivo: number;
  /** Cuántos comisionan: vendidos − objetivo. */
  cupo: number;
  planes: VentaImportada[];
  elegidos?: ReadonlySet<string>;
}

/**
 * Planilla de Comisiones — liquidación mensual del equipo comercial a partir
 * del Excel que exporta FileMaker.
 *
 * Flujo: subir/arrastrar el Excel → revisar cómo quedó clasificado → calcular → reportes.
 */
@Component({
  selector: 'app-planilla-comisiones',
  imports: [
    TablaLiquidacionComponent,
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

  /** Importar y borrar planillas queda reservado al super admin. */
  protected readonly esSuperAdmin = this.authService.isSuperAdmin;

  protected readonly clasifLabel = CLASIF_LABEL;
  protected readonly estadoLabel = ESTADO_PERIODO_LABEL;
  protected readonly tipoLabel = TIPO_LABEL;
  protected readonly meses = MESES;
  protected readonly clasificaciones = Object.keys(CLASIF_LABEL) as ClasifComision[];

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
  /** Campo para dar de alta un valor de captación nuevo desde configuración. */
  protected readonly captacionNueva = signal('');
  protected readonly filtroClasif = signal<ClasifComision | null>(null);
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
  }

  ngOnDestroy(): void {
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
      return id
        ? this.service.ventasRequest(id, { clasif: 'PLANPAQ', limite: 100 })
        : undefined;
    },
    { defaultValue: paginaVacia<VentaImportada>() },
  );

  protected readonly planesNin = httpResource<RespuestaPaginada<VentaImportada>>(
    () => {
      const id = this.periodoId();
      return id
        ? this.service.ventasRequest(id, { clasif: 'PLANNIN', limite: 100 })
        : undefined;
    },
    { defaultValue: paginaVacia<VentaImportada>() },
  );

  /**
   * Los planes agrupados por vendedora y tipo, con el cupo ya resuelto.
   *
   * El cupo es `vendidos − objetivo`: solo comisionan los planes que SUPERAN el
   * objetivo, así que con 5 paquetes y objetivo 4 comisiona uno. Se marca cuál
   * comisiona reproduciendo el orden que usa el sistema (base más baja primero),
   * para que lo que se ve en pantalla sea lo que se va a pagar.
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

        // Mismo orden que usa el motor: base ascendente, y a igualdad el id.
        const planes = [...grupo.planes].sort(
          (a, b) => Number(a.ingresoNeto) - Number(b.ingresoNeto) || a.id.localeCompare(b.id),
        );
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
    cambios: CambiosVendedora,
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
    /* Como NÚMERO. Iba como texto —`sueldoBase` se lee así, porque es un
       Decimal— y el DTO lo rechazaba con 400: el sueldo no se guardaba y la
       planilla liquidaba con cero. Ahora el tipo `CambiosVendedora` lo impide. */
    void this.guardarVendedora(vendedora, { sueldoBase });
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

  /* ── Metas: base o propias del mes ───────────────────────────────────── */

  /** Metas que rigen en el periodo elegido (propias del mes, o las base). */
  private readonly metasResueltas = signal<Objetivo[]>([]);

  /** Qué pestaña de metas se está viendo: las base o las del mes. */
  protected readonly metasDelPeriodo = signal(false);

  /** Las que se muestran y editan según la pestaña activa. */
  protected readonly metasVisibles = computed(() =>
    this.metasDelPeriodo() ? this.metasResueltas() : (this.configuracion()?.objetivos ?? []),
  );

  /** true = este mes tiene metas propias, no las heredadas. */
  protected readonly hayMetasPropias = computed(() =>
    this.metasResueltas().some(o => o.periodoId !== null),
  );

  protected async verMetas(delPeriodo: boolean): Promise<void> {
    this.metasDelPeriodo.set(delPeriodo);
    const periodoId = this.periodoId();
    if (delPeriodo && periodoId) {
      try {
        this.metasResueltas.set(await this.service.objetivosDelPeriodo(periodoId));
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

    const periodoId = this.periodoId();
    try {
      if (this.metasDelPeriodo() && periodoId) {
        // Aunque la fila venga heredada, guardar crea la meta propia del mes.
        await this.service.guardarObjetivoDePeriodo(periodoId, objetivo.tipo, datos);
        this.toast.success(`Meta de ${objetivo.tipo} guardada para este mes.`, 'Guardado');
        await this.verMetas(true);
      } else {
        await this.service.actualizarObjetivo(objetivo.id, datos);
        this.toast.success(`Meta base de ${objetivo.tipo} actualizada.`, 'Guardado');
        await this.cargarConfiguracion();
      }
    } catch (err) {
      this.toast.error(mensajeDeError(err, 'No se pudo guardar la meta.'), 'Error');
    }
  }

  protected async quitarMetaDelMes(tipo: TipoVendedora): Promise<void> {
    const periodoId = this.periodoId();
    if (!periodoId) return;

    try {
      await this.service.eliminarObjetivoDePeriodo(periodoId, tipo);
      this.toast.success(`${tipo} vuelve a la meta base.`, 'Eliminada');
      await this.verMetas(true);
    } catch (err) {
      this.toast.error(mensajeDeError(err, 'No se pudo quitar la meta del mes.'), 'Error');
    }
  }

  /**
   * Aplica sobre la configuración ya cargada el canal que devolvió el backend,
   * en vez de volver a pedirla entera. Ajustar los canales uno tras otro es el
   * uso normal de esa tabla, y cada refresco completo son varias consultas para
   * reflejar el cambio de un solo campo.
   */
  private aplicarCaptacion(guardado: MapeoCaptacion | null, valorBorrado?: string): void {
    this.configuracion.update(cfg => {
      if (!cfg) return cfg;
      const clave = guardado?.valor ?? valorBorrado;
      const resto = cfg.captacion.filter(c => c.valor !== clave);
      const lista = guardado ? [...resto, guardado] : resto;
      return { ...cfg, captacion: lista.sort((a, b) => a.valor.localeCompare(b.valor)) };
    });
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
      this.aplicarCaptacion(guardado);
    } catch (err) {
      this.toast.error(mensajeDeError(err, 'No se pudo guardar la captación.'), 'Error');
    }
  }

  protected async eliminarCaptacion(valor: string): Promise<void> {
    try {
      await this.service.eliminarCaptacion(valor);
      // Sin regla propia, el clasificador lo trata como EMPRESA.
      this.toast.success(`"${valor}" vuelve a contar como EMPRESA.`, 'Eliminado');
      this.aplicarCaptacion(null, valor);
    } catch (err) {
      this.toast.error(mensajeDeError(err, 'No se pudo eliminar la captación.'), 'Error');
    }
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
