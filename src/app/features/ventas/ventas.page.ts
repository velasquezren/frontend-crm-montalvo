import { ActivatedRoute, Router } from '@angular/router';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  EffectCleanupRegisterFn,
  inject,
  OnDestroy,
  signal,
  TemplateRef,
  viewChild,
  ViewContainerRef,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { httpResource } from '@angular/common/http';
import { OverlayRef } from '@angular/cdk/overlay';

import { mensajeDeError } from '../../core/api/http-error';
import { paginaVacia, RespuestaPaginada } from '../../core/api/pagination.model';
import { AuthService } from '../../core/auth/auth.service';
import { generarIniciales } from '../../core/auth/user.model';
import { ToastService } from '../../core/toast/toast.service';
import { Cliente } from '../clientes/cliente.model';
import { ClientesService } from '../clientes/clientes.service';
import { Lead, ORIGEN_LABEL } from '../leads/lead.model';
import { LeadsService } from '../leads/leads.service';
import { AvatarComponent } from '../../shared/components/avatar/avatar.component';
import { BadgeComponent } from '../../shared/components/badge/badge.component';
import { ButtonComponent } from '../../shared/components/button/button.component';
import { KpiCardComponent } from '../../shared/components/kpi-card/kpi-card.component';
import { DialogService } from '../../shared/components/dialog/dialog.service';
import { DrawerComponent } from '../../shared/components/drawer/drawer.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { ErrorCargaComponent } from '../../shared/components/error-carga/error-carga.component';
import { FilterChipComponent } from '../../shared/components/filter-chip/filter-chip.component';
import { IconComponent, IconName } from '../../shared/components/icon/icon.component';
import { InputComponent } from '../../shared/components/input/input.component';
import { LoadingSkeletonComponent } from '../../shared/components/loading-skeleton/loading-skeleton.component';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { PaginatorComponent } from '../../shared/components/paginator/paginator.component';
import { TableComponent } from '../../shared/components/table/table.component';
import { ImageViewerComponent } from '../../shared/components/image-viewer/image-viewer.component';
import { DonutChartComponent } from '../../shared/components/charts/donut-chart.component';
import { BarChartComponent, ChartItem } from '../../shared/components/charts/bar-chart.component';
import {
  ESTADO_VENTA_BADGE,
  ESTADO_VENTA_LABEL,
  EstadoVenta,
} from '../../shared/models/estados.model';
import { MonedaService } from '../../core/moneda/moneda.service';
import { MonedaPipe } from '../../shared/pipes/moneda.pipe';
import { CATALOGO_VACIO, filtrarMedicos, filtrarServicios, moduloDeServicio } from './catalogo.util';
import {
  AgenteResumenVenta,
  CatalogoClinico,
  ComprobanteSubido,
  MetodoPagoVenta,
  PresetPeriodo,
  Venta,
} from './venta.model';
import { VentasService } from './ventas.service';
import { esNombreProvisional } from '../../shared/models/nombre-cliente';
import { InicialesClientePipe, NombreClientePipe } from '../../shared/pipes/nombre-cliente.pipe';

type FiltroVenta = EstadoVenta | 'TODAS';

export const METODOS_PAGO: readonly { id: MetodoPagoVenta; label: string; icon: IconName }[] = [
  { id: 'QR', label: 'Pago QR', icon: 'dollar-sign' },
  { id: 'TRANSFERENCIA', label: 'Transferencia', icon: 'wallet' },
  { id: 'TARJETA', label: 'Tarjeta Déb./Créd.', icon: 'wallet' },
  { id: 'EFECTIVO', label: 'Efectivo en Caja', icon: 'dollar-sign' },
];

export const PRESETS_PERIODO: readonly { id: PresetPeriodo; label: string }[] = [
  { id: 'TODAS', label: 'Cualquier fecha' },
  { id: 'HOY', label: 'Hoy' },
  { id: '7DIAS', label: 'Últimos 7 días' },
  { id: 'ESTE_MES', label: 'Este mes' },
  { id: 'MES_ANTERIOR', label: 'Mes anterior' },
  { id: 'PERSONALIZADO', label: 'Rango libre' },
];

/**
 * Calcula fechas ISO desde/hasta en tiempo local para enviar al backend.
 */
function calcularRangoFechas(
  preset: PresetPeriodo,
  fechaDesdePersonalizada?: string,
  fechaHastaPersonalizada?: string,
): { desde?: string; hasta?: string } {
  const ahora = new Date();
  const year = ahora.getFullYear();
  const month = ahora.getMonth();
  const day = ahora.getDate();

  switch (preset) {
    case 'HOY': {
      const inicio = new Date(year, month, day, 0, 0, 0, 0);
      const fin = new Date(year, month, day, 23, 59, 59, 999);
      return { desde: inicio.toISOString(), hasta: fin.toISOString() };
    }
    case '7DIAS': {
      const inicio = new Date(ahora.getTime() - 7 * 24 * 60 * 60 * 1000);
      inicio.setHours(0, 0, 0, 0);
      const fin = new Date(year, month, day, 23, 59, 59, 999);
      return { desde: inicio.toISOString(), hasta: fin.toISOString() };
    }
    case 'ESTE_MES': {
      const inicio = new Date(year, month, 1, 0, 0, 0, 0);
      const fin = new Date(year, month + 1, 0, 23, 59, 59, 999);
      return { desde: inicio.toISOString(), hasta: fin.toISOString() };
    }
    case 'MES_ANTERIOR': {
      const inicio = new Date(year, month - 1, 1, 0, 0, 0, 0);
      const fin = new Date(year, month, 0, 23, 59, 59, 999);
      return { desde: inicio.toISOString(), hasta: fin.toISOString() };
    }
    case 'PERSONALIZADO': {
      let desde: string | undefined;
      let hasta: string | undefined;
      if (fechaDesdePersonalizada) {
        const [y, m, d] = fechaDesdePersonalizada.split('-').map(Number);
        if (!isNaN(y) && !isNaN(m) && !isNaN(d)) {
          desde = new Date(y, m - 1, d, 0, 0, 0, 0).toISOString();
        }
      }
      if (fechaHastaPersonalizada) {
        const [y, m, d] = fechaHastaPersonalizada.split('-').map(Number);
        if (!isNaN(y) && !isNaN(m) && !isNaN(d)) {
          hasta = new Date(y, m - 1, d, 23, 59, 59, 999).toISOString();
        }
      }
      return { desde, hasta };
    }
    case 'TODAS':
    default:
      return {};
  }
}

/**
 * Ventas — datos reales (RF-11/RF-12). El agente que registra queda fijado
 * por el JWT en el servidor; una venta GANADA genera comisión y recategoriza
 * al cliente automáticamente. Un agente ve solo sus ventas; un admin todas.
 */
@Component({
  selector: 'app-ventas',
  imports: [
    InicialesClientePipe,
    NombreClientePipe,
    PageHeaderComponent,
    KpiCardComponent,
    IconComponent,
    InputComponent,
    ButtonComponent,
    DrawerComponent,
    FilterChipComponent,
    TableComponent,
    AvatarComponent,
    BadgeComponent,
    EmptyStateComponent,
    ErrorCargaComponent,
    LoadingSkeletonComponent,
    PaginatorComponent,
    ImageViewerComponent,
    DonutChartComponent,
    BarChartComponent,
    MonedaPipe,
    DatePipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './ventas.page.html',
})
export class VentasPage implements OnDestroy {
  /* Los KPI se formatean con el servicio y no con `formatearBs`, que imprimía
     siempre "Bs": leer aquí la señal de moneda hace que este computed se
     recalcule al pulsar el selector, y así las tarjetas dejan de contradecir a
     la tabla que tienen debajo. */
  private readonly moneda = inject(MonedaService);

  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly ventasService = inject(VentasService);
  private readonly clientesService = inject(ClientesService);
  private readonly leadsService = inject(LeadsService);
  private readonly authService = inject(AuthService);
  private readonly toastService = inject(ToastService);
  private readonly dialogService = inject(DialogService);
  private readonly vcr = inject(ViewContainerRef);

  protected readonly modalVentaTemplate = viewChild<TemplateRef<unknown>>('modalVentaTemplate');
  protected readonly modalMotivoPerdidaTemplate = viewChild<TemplateRef<unknown>>('modalMotivoPerdidaTemplate');
  protected readonly drawerDetalleTemplate = viewChild<TemplateRef<unknown>>('drawerDetalleTemplate');

  /** Cambiar el estado de una venta (marcarla perdida, revertir un cierre) es cosa de ADMIN+. */
  protected readonly esAdmin = this.authService.isAdmin;
  protected readonly origenLabel = ORIGEN_LABEL;

  private activeOverlayRef?: OverlayRef;
  private activeDrawerRef?: OverlayRef;
  private queryParamsProcesados = false;

  protected readonly estadoBadge = ESTADO_VENTA_BADGE;
  protected readonly estadoLabel = ESTADO_VENTA_LABEL;
  protected readonly iniciales = generarIniciales;

  /* Un contacto que llegó por WhatsApp sin dar su nombre se guarda como
     "WhatsApp +591…", y entonces el título YA es el teléfono: repetirlo debajo
     era decir dos veces el mismo número. Ver `shared/models/nombre-cliente`. */
  protected sinNombre(cliente: { nombre: string; telefono: string }): boolean {
    return esNombreProvisional(cliente.nombre);
  }

  protected readonly metodosPago = METODOS_PAGO;
  protected readonly presetsPeriodo = PRESETS_PERIODO;

  /* ── Filtros Principales ────────────────────────────────────────── */
  protected readonly filtro = signal<FiltroVenta>('TODAS');
  protected readonly filtros: readonly FiltroVenta[] = ['TODAS', 'GANADA', 'EN_PROCESO', 'PERDIDA'];

  protected readonly pagina = signal(1);
  protected readonly busqueda = signal('');
  private readonly busquedaDebounced = signal('');

  /* Filtro de Período Temporal */
  protected readonly presetPeriodo = signal<PresetPeriodo>('TODAS');
  protected readonly fechaDesdePersonalizada = signal('');
  protected readonly fechaHastaPersonalizada = signal('');

  /* Filtro de Agente (ADMIN / SUPER_ADMIN) */
  protected readonly agenteSeleccionadoId = signal<string>('TODOS');

  /* Filtros Secundarios en Memoria */
  protected readonly metodoPagoFiltro = signal<MetodoPagoVenta | 'TODOS'>('TODOS');
  protected readonly comprobanteFiltro = signal<'TODOS' | 'CON_COMPROBANTE' | 'SIN_COMPROBANTE'>('TODOS');

  /* Modo de Visualización: Tabla Operativa vs Métricas & Distribución */
  protected readonly vistaActiva = signal<'tabla' | 'analitica'>('tabla');

  /* ── Datos Remotos: Ventas Paginadas ───────────────────────────── */
  protected readonly ventas = httpResource<RespuestaPaginada<Venta>>(
    () => {
      const estado = this.filtro() === 'TODAS' ? undefined : (this.filtro() as EstadoVenta);
      const agenteId = this.agenteSeleccionadoId() === 'TODOS' ? undefined : this.agenteSeleccionadoId();
      const metodoPago = this.metodoPagoFiltro() === 'TODOS' ? undefined : this.metodoPagoFiltro();
      const comprobante = this.comprobanteFiltro() === 'TODOS' ? undefined : this.comprobanteFiltro();
      const { desde, hasta } = calcularRangoFechas(
        this.presetPeriodo(),
        this.fechaDesdePersonalizada(),
        this.fechaHastaPersonalizada(),
      );

      return this.ventasService.listarRequest({
        q: this.busquedaDebounced(),
        estado,
        agenteId,
        desde,
        hasta,
        metodoPago,
        comprobante,
        pagina: this.pagina(),
        limite: 25,
      });
    },
    { defaultValue: paginaVacia<Venta>() },
  );

  /* Lista de agentes para el dropdown de filtro (disponible para ADMIN+) */
  protected readonly agentes = httpResource<readonly AgenteResumenVenta[]>(
    () => (this.esAdmin() ? this.ventasService.agentesRequest() : undefined),
    { defaultValue: [] },
  );

  /* ── Ventas del Servidor (Garantiza Paginación Real y Exacta) ─── */
  protected readonly ventasFiltradas = computed(() => this.ventas.value().datos);

  /* Etiquetas amigables para filtros activos */
  protected readonly etiquetaEstadoActivo = computed(() => {
    const f = this.filtro();
    return f === 'TODAS' ? 'Todas' : this.estadoLabel[f as EstadoVenta];
  });

  protected readonly etiquetaPeriodoActivo = computed(() => {
    const p = PRESETS_PERIODO.find(item => item.id === this.presetPeriodo());
    return p ? p.label : this.presetPeriodo();
  });

  protected readonly etiquetaMetodoPagoActivo = computed(() => {
    const mp = METODOS_PAGO.find(item => item.id === this.metodoPagoFiltro());
    return mp ? mp.label : this.metodoPagoFiltro();
  });

  protected readonly nombreAgenteActivo = computed(() => {
    const ag = this.agentes.value().find(item => item.id === this.agenteSeleccionadoId());
    return ag ? ag.nombre : this.agenteSeleccionadoId();
  });

  /* Contador de filtros activos */
  protected readonly totalFiltrosActivos = computed(() => {
    let count = 0;
    if (this.filtro() !== 'TODAS') count++;
    if (this.presetPeriodo() !== 'TODAS') count++;
    if (this.agenteSeleccionadoId() !== 'TODOS') count++;
    if (this.metodoPagoFiltro() !== 'TODOS') count++;
    if (this.comprobanteFiltro() !== 'TODOS') count++;
    if (this.busqueda().trim().length > 0) count++;
    return count;
  });

  protected readonly hayFiltrosActivos = computed(() => this.totalFiltrosActivos() > 0);

  /* ── Detalle / Cajón Lateral (Drawer 360°) ─────────────────────── */
  protected readonly ventaSeleccionada = signal<Venta | null>(null);

  /* Visor atómico de Comprobante (<app-image-viewer>) */
  protected readonly visorImagenUrl = signal<string | null>(null);
  protected readonly visorImagenTitulo = signal<string | null>(null);

  /* ── Formulario "Registrar venta" ─────────────────────────────── */
  protected readonly formularioAbierto = signal(false);
  protected readonly busquedaCliente = signal('');
  protected readonly clienteElegido = signal<Cliente | null>(null);
  protected readonly producto = signal('');
  protected readonly monto = signal('');
  protected readonly metodoPago = signal<MetodoPagoVenta>('QR');
  protected readonly comprobante = signal('');
  protected readonly medico = signal('');
  protected readonly notas = signal('');
  protected readonly guardando = signal(false);
  protected readonly errorForm = signal('');

  /** Lead de origen elegido para esta venta (opcional). Ver `leadsAbiertosDelCliente`. */
  protected readonly leadIdSeleccionado = signal<string | null>(null);

  /* ── Cambio de estado de una venta ya registrada (ADMIN) ────────── */
  protected readonly ventaParaMotivo = signal<Venta | null>(null);
  protected readonly motivoPerdidaTexto = signal('');
  protected readonly cambiandoEstado = signal(false);

  /* Adjunto de Comprobante / Recibo */
  protected readonly subiendoComprobante = signal(false);
  protected readonly comprobanteSubido = signal<ComprobanteSubido | null>(null);
  protected readonly archivoNombre = signal<string | null>(null);

  constructor() {
    effect((onCleanup: EffectCleanupRegisterFn) => {
      const texto = this.busqueda().trim();
      const timer = setTimeout(() => {
        this.busquedaDebounced.set(texto);
        this.pagina.set(1);
      }, 200);
      onCleanup(() => clearTimeout(timer));
    });

    effect(() => {
      const qp = this.route.snapshot.queryParams;
      const clienteId = qp['clienteId'];
      const clienteNombre = qp['clienteNombre'];
      const clienteTelefono = qp['clienteTelefono'];
      const nuevo = qp['nuevo'];
      const tpl = this.modalVentaTemplate();

      if (nuevo === '1' && tpl && !this.formularioAbierto() && !this.queryParamsProcesados) {
        this.queryParamsProcesados = true;
        if (clienteId && clienteNombre) {
          this.elegirCliente({
            id: clienteId,
            nombre: clienteNombre,
            telefono: clienteTelefono || '',
            email: null,
            categoria: 'PROSPECTO',
            agenteId: null,
            agente: null,
            intereses: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
          /* Viene de la ficha de un lead ("Registrar Venta"): se preselecciona
             como origen. `elegirCliente` ya limpió este signal justo arriba,
             así que fijarlo acá después es lo que queda. */
          const leadId = qp['leadId'];
          if (leadId) {
            this.leadIdSeleccionado.set(leadId);
          }
        }
        this.abrirFormulario(tpl);
      }
    });
  }

  ngOnDestroy(): void {
    this.activeOverlayRef?.dispose();
    this.activeDrawerRef?.dispose();
  }

  protected abrirFormulario(template: TemplateRef<unknown>): void {
    this.formularioAbierto.set(true);
    this.activeOverlayRef = this.dialogService.abrirCajon(template, this.vcr, {
      onClose: () => this.cerrarFormulario(),
    });
  }

  protected cerrarFormulario(): void {
    this.formularioAbierto.set(false);
    this.activeOverlayRef?.dispose();
    this.activeOverlayRef = undefined;
    if (this.route.snapshot.queryParams['nuevo']) {
      void this.router.navigate([], { queryParams: {}, replaceUrl: true });
    }
  }

  /**
   * Catálogo real de la clínica. Se pide al abrir el formulario y no antes: no
   * tiene sentido cargarlo al entrar al listado, que es lo que la agente hace
   * más veces.
   */
  protected readonly catalogo = httpResource<CatalogoClinico>(
    () => (this.formularioAbierto() ? this.ventasService.catalogoRequest() : undefined),
    { defaultValue: CATALOGO_VACIO },
  );

  /**
   * Servicios que coinciden con lo tecleado, los más vendidos primero.
   *
   * Sin texto muestra los diez más frecuentes, que es lo que resuelve la mayoría
   * de los registros sin escribir nada: consulta externa, hemograma, ecografía.
   */
  protected readonly serviciosSugeridos = computed(() =>
    filtrarServicios(this.catalogo.value(), this.producto()),
  );

  /**
   * El módulo ya no lo elige nadie: sale del servicio elegido.
   *
   * Antes había un selector de ocho "especialidades" escrito a mano que no
   * existía en FileMaker. Los módulos de verdad son cuatro y son operativos
   * —LABORATORIO, CONSULTA, PLANES, INTERNACION—, además de ser entrada del
   * motor de comisiones. Deducirlos del servicio quita un clic y hace que lo
   * guardado venga del dato, no de lo que alguien supuso.
   */
  protected readonly moduloDetectado = computed(() =>
    moduloDeServicio(this.catalogo.value(), this.producto()),
  );

  protected readonly medicosSugeridos = computed(() =>
    filtrarMedicos(this.catalogo.value(), this.medico()),
  );

  /* Búsqueda de cliente: solo consulta con 2+ caracteres */
  protected readonly resultadosCliente = httpResource<readonly Cliente[]>(
    () => {
      const termino = this.busquedaCliente().trim();
      return termino.length >= 2 && !this.clienteElegido()
        ? this.clientesService.buscarRequest(termino)
        : undefined;
    },
    { defaultValue: [] },
  );

  /**
   * Leads del cliente elegido, para vincular la venta a su origen (RF-17
   * extendido: de qué campaña/canal vino una venta real, no solo un lead
   * cerrado en bloque). Se pide solo con el formulario abierto y un cliente
   * puesto — no tiene sentido antes.
   */
  protected readonly leadsDelCliente = httpResource<RespuestaPaginada<Lead>>(
    () => {
      const cliente = this.clienteElegido();
      return this.formularioAbierto() && cliente
        ? this.leadsService.listarRequest({ clienteId: cliente.id, pagina: 1, limite: 10 })
        : undefined;
    },
    { defaultValue: paginaVacia<Lead>() },
  );

  /** Solo los que siguen abiertos: uno ya CONVERTIDO o PERDIDO no es un origen útil para elegir. */
  protected readonly leadsAbiertosDelCliente = computed(() =>
    this.leadsDelCliente.value().datos.filter(l => l.estado === 'NUEVO' || l.estado === 'CONTACTADO'),
  );

  /* ── KPIs Médicos y Comerciales del Filtro Actual ────────────────── */
  protected readonly resumenKpis = computed(() => {
    const lista = this.ventasFiltradas();
    const ganadas = lista.filter(v => v.estado === 'GANADA');
    const enProceso = lista.filter(v => v.estado === 'EN_PROCESO');
    const perdidas = lista.filter(v => v.estado === 'PERDIDA');

    const totalCerrado = ganadas.reduce((sum, v) => sum + Number(v.monto), 0);
    const montoEnProceso = enProceso.reduce((sum, v) => sum + Number(v.monto), 0);
    const ticketPromedio = ganadas.length > 0 ? Math.round(totalCerrado / ganadas.length) : 0;
    const tasaCierre = lista.length > 0 ? `${Math.round((ganadas.length / lista.length) * 100)}% efectividad` : '0% efectividad';

    return {
      totalCerrado: this.moneda.formatearBob(totalCerrado),
      pieCerrado: `${ganadas.length} venta${ganadas.length === 1 ? '' : 's'} cerrada${ganadas.length === 1 ? '' : 's'}`,
      conteoGanadas: ganadas.length,
      tasaCierre,
      conteoEnProceso: enProceso.length,
      montoEnProceso: `Potencial ${this.moneda.formatearBob(montoEnProceso)}`,
      ticketPromedio: this.moneda.formatearBob(ticketPromedio),
      conteoPerdidas: perdidas.length,
    };
  });

  /* ── Gráficos Analíticos de Distribución ────────────────────────── */
  protected readonly chartMetodosPago = computed<ChartItem[]>(() => {
    const mapa = new Map<string, { count: number; monto: number }>();
    for (const mp of METODOS_PAGO) {
      mapa.set(mp.id, { count: 0, monto: 0 });
    }

    for (const v of this.ventas.value().datos) {
      if (v.metodoPago) {
        const actual = mapa.get(v.metodoPago) || { count: 0, monto: 0 };
        actual.count += 1;
        actual.monto += Number(v.monto);
        mapa.set(v.metodoPago, actual);
      }
    }

    const items: ChartItem[] = [];
    for (const mp of METODOS_PAGO) {
      const data = mapa.get(mp.id);
      if (data && data.count > 0) {
        items.push({
          id: mp.id,
          label: mp.label,
          value: data.count,
          sublabel: this.moneda.formatearBob(data.monto),
        });
      }
    }
    return items;
  });

  protected readonly chartModulos = computed<ChartItem[]>(() => {
    const mapa = new Map<string, { count: number; monto: number }>();
    for (const v of this.ventas.value().datos) {
      const mod = v.modulo || 'OTROS';
      const actual = mapa.get(mod) || { count: 0, monto: 0 };
      actual.count += 1;
      actual.monto += Number(v.monto);
      mapa.set(mod, actual);
    }

    const items: ChartItem[] = [];
    for (const [mod, data] of mapa.entries()) {
      items.push({
        id: mod,
        label: mod,
        value: data.count,
        sublabel: this.moneda.formatearBob(data.monto),
      });
    }
    return items.sort((a, b) => b.value - a.value);
  });

  protected elegirCliente(cliente: Cliente): void {
    this.clienteElegido.set(cliente);
    this.busquedaCliente.set(cliente.nombre);
    /* Un cliente nuevo invalida el lead que se hubiera elegido antes — lo
       vuelve a fijar quien llame esto con contexto (ver el efecto de arriba). */
    this.leadIdSeleccionado.set(null);
  }

  protected limpiarCliente(): void {
    this.clienteElegido.set(null);
    this.busquedaCliente.set('');
    this.leadIdSeleccionado.set(null);
  }

  protected seleccionarSugerencia(nombreServicio: string): void {
    this.producto.set(nombreServicio);
  }

  protected async onArchivoSeleccionado(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    const file = input.files[0];
    this.archivoNombre.set(file.name);
    this.subiendoComprobante.set(true);
    this.errorForm.set('');

    try {
      const res = await this.ventasService.subirComprobante(file);
      this.comprobanteSubido.set(res);
    } catch (err) {
      this.errorForm.set(mensajeDeError(err, 'No se pudo subir el archivo de comprobante'));
      this.archivoNombre.set(null);
      this.comprobanteSubido.set(null);
    } finally {
      this.subiendoComprobante.set(false);
    }
  }

  protected quitarComprobante(): void {
    this.archivoNombre.set(null);
    this.comprobanteSubido.set(null);
  }

  /* ── Métodos de Filtro ─────────────────────────────────────────── */

  protected cambiarFiltro(nuevo: FiltroVenta): void {
    this.filtro.set(nuevo);
    this.pagina.set(1);
  }

  protected cambiarPresetPeriodo(preset: PresetPeriodo): void {
    this.presetPeriodo.set(preset);
    this.pagina.set(1);
  }

  protected cambiarAgente(event: Event): void {
    const val = (event.target as HTMLSelectElement).value;
    this.agenteSeleccionadoId.set(val);
    this.pagina.set(1);
  }

  protected cambiarMetodoPagoFiltro(metodo: MetodoPagoVenta | 'TODOS'): void {
    this.metodoPagoFiltro.set(metodo);
    this.pagina.set(1);
  }

  protected cambiarComprobanteFiltro(tipo: 'TODOS' | 'CON_COMPROBANTE' | 'SIN_COMPROBANTE'): void {
    this.comprobanteFiltro.set(tipo);
    this.pagina.set(1);
  }

  protected limpiarTodosLosFiltros(): void {
    this.filtro.set('TODAS');
    this.presetPeriodo.set('TODAS');
    this.fechaDesdePersonalizada.set('');
    this.fechaHastaPersonalizada.set('');
    this.agenteSeleccionadoId.set('TODOS');
    this.metodoPagoFiltro.set('TODOS');
    this.comprobanteFiltro.set('TODOS');
    this.busqueda.set('');
    this.pagina.set(1);
  }

  protected onChartSegmentClick(segmentId: string, tipo: 'metodo' | 'modulo'): void {
    if (tipo === 'metodo') {
      const coincide = METODOS_PAGO.find(m => m.id === segmentId || m.label === segmentId);
      if (coincide) {
        this.metodoPagoFiltro.set(coincide.id);
        this.vistaActiva.set('tabla');
      }
    } else if (tipo === 'modulo') {
      this.busqueda.set(segmentId);
      this.vistaActiva.set('tabla');
    }
  }

  /* ── Cajón Lateral (Drawer de Detalle 360°) ────────────────────── */

  protected abrirDetalleVenta(venta: Venta, template?: TemplateRef<unknown>): void {
    const tpl = template ?? this.drawerDetalleTemplate();
    if (!tpl) return;
    this.ventaSeleccionada.set(venta);
    this.activeDrawerRef?.dispose();
    this.activeDrawerRef = this.dialogService.abrirCajon(tpl, this.vcr, {
      onClose: () => this.cerrarDetalleVenta(),
    });
  }

  protected cerrarDetalleVenta(): void {
    this.ventaSeleccionada.set(null);
    this.activeDrawerRef?.dispose();
    this.activeDrawerRef = undefined;
  }

  /* ── Visor de Comprobante (<app-image-viewer>) ──────────────────── */

  protected abrirVisorImagen(url: string, nombre?: string | null): void {
    this.visorImagenUrl.set(url);
    this.visorImagenTitulo.set(nombre || 'Comprobante de pago');
  }

  protected cerrarVisorImagen(): void {
    this.visorImagenUrl.set(null);
    this.visorImagenTitulo.set(null);
  }

  protected getWhatsappLink(telefono?: string): string {
    if (!telefono) return '';
    const limpio = telefono.replace(/\D/g, '');
    const numFinal = limpio.startsWith('591') ? limpio : `591${limpio}`;
    return `https://wa.me/${numFinal}`;
  }

  protected async guardar(event: Event): Promise<void> {
    event.preventDefault();
    this.errorForm.set('');

    const cliente = this.clienteElegido();
    const monto = Number(this.monto());
    if (!cliente) {
      this.errorForm.set('Busca y selecciona un cliente o paciente.');
      return;
    }
    if (!this.producto().trim()) {
      this.errorForm.set('Indica el producto, procedimiento o servicio vendido.');
      return;
    }
    if (!monto || monto <= 0) {
      this.errorForm.set('Ingresa un monto válido en Bs.');
      return;
    }

    const subido = this.comprobanteSubido();

    this.guardando.set(true);
    try {
      await this.ventasService.crear({
        clienteId: cliente.id,
        producto: this.producto().trim(),
        monto,
        metodoPago: this.metodoPago(),
        comprobante: this.comprobante().trim() || undefined,
        comprobanteKey: subido?.comprobanteKey,
        comprobanteMime: subido?.comprobanteMime,
        comprobanteNombre: subido?.comprobanteNombre,
        medico: this.medico().trim() || undefined,
        modulo: this.moduloDetectado() || undefined,
        notas: this.notas().trim() || undefined,
        leadId: this.leadIdSeleccionado() ?? undefined,
      });

      this.cerrarFormulario();
      this.limpiarCliente();
      this.producto.set('');
      this.monto.set('');
      this.comprobante.set('');
      this.medico.set('');
      this.notas.set('');
      this.quitarComprobante();
      this.ventas.reload();
    } catch (err) {
      this.errorForm.set(mensajeDeError(err, 'No se pudo registrar la venta. Intenta de nuevo.'));
    } finally {
      this.guardando.set(false);
    }
  }

  /* ── Cambiar estado de una venta ya registrada (ADMIN) ────────────── */

  protected cambiarEstadoVenta(venta: Venta, estado: EstadoVenta): void {
    if (estado === venta.estado) return;

    if (estado === 'PERDIDA') {
      this.abrirMotivoPerdidaVenta(venta);
      return;
    }

    void this.aplicarCambioEstadoVenta(venta, estado);
  }

  /** Pide el motivo antes de marcar PERDIDA — el backend lo exige y lo deja en AuditLog. */
  protected abrirMotivoPerdidaVenta(venta: Venta): void {
    const template = this.modalMotivoPerdidaTemplate();
    if (!template) return;

    this.ventaParaMotivo.set(venta);
    this.motivoPerdidaTexto.set('');

    this.activeOverlayRef?.dispose();
    this.activeOverlayRef = this.dialogService.openTemplate(template, this.vcr, {
      onClose: () => this.cerrarMotivoPerdidaVenta(),
    });
  }

  protected cerrarMotivoPerdidaVenta(): void {
    this.ventaParaMotivo.set(null);
    this.activeOverlayRef?.dispose();
    this.activeOverlayRef = undefined;
  }

  protected async confirmarMotivoPerdidaVenta(): Promise<void> {
    const venta = this.ventaParaMotivo();
    const motivo = this.motivoPerdidaTexto().trim();
    if (!venta || motivo.length < 3) return;

    this.cerrarMotivoPerdidaVenta();
    await this.aplicarCambioEstadoVenta(venta, 'PERDIDA', motivo);
  }

  private async aplicarCambioEstadoVenta(
    venta: Venta,
    estado: EstadoVenta,
    motivoPerdida?: string,
  ): Promise<void> {
    this.cambiandoEstado.set(true);
    try {
      const actualizada = await this.ventasService.cambiarEstado(venta.id, estado, motivoPerdida);
      this.toastService.success(`Venta actualizada a ${this.estadoLabel[estado]}`, 'Estado actualizado');
      if (this.ventaSeleccionada()?.id === venta.id) {
        this.ventaSeleccionada.set(actualizada);
      }
      this.ventas.reload();
    } catch (err: unknown) {
      this.toastService.error(
        mensajeDeError(err, 'No se pudo cambiar el estado de la venta.'),
        'Error',
      );
    } finally {
      this.cambiandoEstado.set(false);
    }
  }
}
