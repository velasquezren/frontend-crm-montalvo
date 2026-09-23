import { ActivatedRoute, Router } from '@angular/router';
import { enlaceWhatsApp } from '../../shared/models/telefono';
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
  untracked,
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
import { IconComponent } from '../../shared/components/icon/icon.component';
import { InputComponent } from '../../shared/components/input/input.component';
import { LoadingSkeletonComponent } from '../../shared/components/loading-skeleton/loading-skeleton.component';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { PaginatorComponent } from '../../shared/components/paginator/paginator.component';
import { SelectComponent } from '../../shared/components/select/select.component';
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
import {
  AgenteResumenVenta,
  MetodoPagoVenta,
  PresetPeriodo,
  RESUMEN_VACIO,
  ResumenVentas,
  Venta,
} from './venta.model';
import { FiltroVentas, VentasService } from './ventas.service';
import { FormularioVentaComponent, METODOS_PAGO, PacienteVenta } from './formulario-venta/formulario-venta.component';
import { esNombreProvisional } from '../../shared/models/nombre-cliente';
import { InicialesClientePipe, NombreClientePipe } from '../../shared/pipes/nombre-cliente.pipe';

type FiltroVenta = EstadoVenta | 'TODAS';

/** Valor del filtro de módulo para las ventas sin módulo (el «Sin módulo» del gráfico). */
const SIN_MODULO = '__SIN_MODULO__';

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
 * por el JWT en el servidor; una venta GANADA recategoriza a la paciente (no
 * genera comisión: esa sale de la planilla de FileMaker). Un agente ve solo
 * sus ventas; un admin todas.
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
    SelectComponent,
    ImageViewerComponent,
    FormularioVentaComponent,
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
  /** Filtro de módulo que se aplica al pulsar un sector del gráfico. */
  protected readonly moduloFiltro = signal<string | null>(null);

  /** Lo que filtra listado y resumen por igual: si divergen, las tarjetas mienten sobre la tabla. */
  private readonly filtroActual = computed<FiltroVentas>(() => {
    const { desde, hasta } = calcularRangoFechas(
      this.presetPeriodo(),
      this.fechaDesdePersonalizada(),
      this.fechaHastaPersonalizada(),
    );
    const modulo = this.moduloFiltro();
    return {
      q: this.busquedaDebounced(),
      estado: this.filtro() === 'TODAS' ? undefined : (this.filtro() as EstadoVenta),
      agenteId: this.agenteSeleccionadoId() === 'TODOS' ? undefined : this.agenteSeleccionadoId(),
      desde,
      hasta,
      metodoPago: this.metodoPagoFiltro() === 'TODOS' ? undefined : this.metodoPagoFiltro(),
      comprobante: this.comprobanteFiltro() === 'TODOS' ? undefined : this.comprobanteFiltro(),
      ...(modulo === SIN_MODULO ? { sinModulo: true } : modulo ? { modulo } : {}),
    };
  });

  protected readonly ventas = httpResource<RespuestaPaginada<Venta>>(
    () => this.ventasService.listarRequest({ ...this.filtroActual(), pagina: this.pagina(), limite: 25 }),
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

  protected readonly etiquetaModuloActivo = computed(() => {
    const modulo = this.moduloFiltro();
    return modulo === SIN_MODULO ? 'Sin módulo' : modulo;
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
    if (this.moduloFiltro() !== null) count++;
    if (this.busqueda().trim().length > 0) count++;
    return count;
  });

  protected readonly hayFiltrosActivos = computed(() => this.totalFiltrosActivos() > 0);

  /* ── Detalle / Cajón Lateral (Drawer 360°) ─────────────────────── */
  protected readonly ventaSeleccionada = signal<Venta | null>(null);

  /* Corrección del origen de una venta ya registrada — CAMP-1. */
  protected readonly corrigiendoOrigen = signal(false);
  protected readonly guardandoOrigen = signal(false);

  /* Visor atómico de Comprobante (<app-image-viewer>) */
  protected readonly visorImagenUrl = signal<string | null>(null);
  protected readonly visorImagenTitulo = signal<string | null>(null);

  /* ── Formulario «Registrar venta» (ver `FormularioVentaComponent`) ── */
  /** Paciente y lead con los que se abre, cuando se viene de otra pantalla. */
  protected readonly pacienteFormulario = signal<PacienteVenta | null>(null);
  protected readonly leadFormulario = signal<string | null>(null);
  /* ── Cambio de estado de una venta ya registrada (ADMIN) ────────── */
  protected readonly ventaParaMotivo = signal<Venta | null>(null);
  protected readonly motivoPerdidaTexto = signal('');
  protected readonly cambiandoEstado = signal(false);

  constructor() {
    effect((onCleanup: EffectCleanupRegisterFn) => {
      const texto = this.busqueda().trim();
      const timer = setTimeout(() => {
        this.busquedaDebounced.set(texto);
        this.pagina.set(1);
      }, 200);
      onCleanup(() => clearTimeout(timer));
    });

    /* `?nuevo=1` desde la ficha de un paciente o de un lead: abre el
       formulario con la paciente —y, si vino de un lead, su origen— ya puestos. */
    effect(() => {
      const tpl = this.modalVentaTemplate();
      if (!tpl || this.queryParamsProcesados) return;
      const qp = this.route.snapshot.queryParams;
      if (qp['nuevo'] !== '1') return;
      this.queryParamsProcesados = true;
      untracked(() => {
        const clienteId: string | undefined = qp['clienteId'];
        const nombre: string | undefined = qp['clienteNombre'];
        this.pacienteFormulario.set(clienteId && nombre ? { id: clienteId, nombre, telefono: qp['clienteTelefono'] || '' } : null);
        this.leadFormulario.set(qp['leadId'] || null);
        this.abrirCajonVenta(tpl);
      });
    });
  }
  ngOnDestroy(): void {
    this.activeOverlayRef?.dispose();
    this.activeDrawerRef?.dispose();
  }

  protected abrirFormulario(template: TemplateRef<unknown>): void {
    this.pacienteFormulario.set(null);
    this.leadFormulario.set(null);
    this.abrirCajonVenta(template);
  }

  private abrirCajonVenta(template: TemplateRef<unknown>): void {
    this.activeOverlayRef?.dispose();
    this.activeOverlayRef = this.dialogService.abrirCajon(template, this.vcr, {
      onClose: () => this.cerrarFormulario(),
    });
  }

  protected cerrarFormulario(): void {
    const abierto = this.activeOverlayRef;
    this.activeOverlayRef = undefined;
    abierto?.dispose();
    if (this.route.snapshot.queryParams['nuevo']) {
      void this.router.navigate([], { queryParams: {}, replaceUrl: true });
    }
  }

  protected alRegistrarVenta(venta: Venta): void {
    this.cerrarFormulario();
    this.toastService.success(`Venta de ${venta.producto} registrada.`);
    this.ventas.reload();
    this.resumen.reload();
  }
  /**
   * TODOS los leads del cliente de la venta abierta, para poder corregir su
   * origen — CAMP-1.
   *
   * Sin filtrar por estado, a diferencia de `leadsAbiertosDelCliente`: el lead
   * que originó la venta quedó en CONVERTIDO al registrarla, así que filtrar
   * por abiertos escondería justamente el que hay que mostrar como actual.
   */
  protected readonly leadsDeLaVentaAbierta = httpResource<RespuestaPaginada<Lead>>(
    () => {
      const venta = this.ventaSeleccionada();
      return venta
        ? this.leadsService.listarRequest({ clienteId: venta.cliente.id, pagina: 1, limite: 20 })
        : undefined;
    },
    { defaultValue: paginaVacia<Lead>() },
  );

  /* ── Tarjetas y gráficos: sobre TODO lo filtrado, no sobre la página ── */
  /**
   * Se calculaban en el navegador con las 25 ventas de la página visible: con
   * más, «Facturación cerrada» sumaba solo esas y se leía como el total. Ahora
   * los cuenta el servidor con el mismo filtro que el listado (`/ventas/resumen`).
   */
  protected readonly resumen = httpResource<ResumenVentas>(
    () => this.ventasService.resumenRequest(this.filtroActual()),
    { defaultValue: RESUMEN_VACIO },
  );

  protected readonly resumenKpis = computed(() => {
    const sinDato = !!this.resumen.error();
    const grupos = this.resumen.value().porEstado;
    const de = (estado: EstadoVenta) => grupos.find(g => g.clave === estado) ?? { cantidad: 0, monto: 0 };
    const ganadas = de('GANADA');
    const enProceso = de('EN_PROCESO');
    const total = grupos.reduce((n, g) => n + g.cantidad, 0);
    const ticket = ganadas.cantidad > 0 ? Math.round(ganadas.monto / ganadas.cantidad) : 0;
    const bs = (valor: number) => (sinDato ? '—' : this.moneda.formatearBob(valor));

    return {
      totalCerrado: bs(ganadas.monto),
      pieCerrado: sinDato ? 'No se pudo calcular' : `${ganadas.cantidad} venta${ganadas.cantidad === 1 ? '' : 's'} cerrada${ganadas.cantidad === 1 ? '' : 's'}`,
      conteoGanadas: sinDato ? '—' : ganadas.cantidad,
      tasaCierre: total > 0 ? `${Math.round((ganadas.cantidad / total) * 100)}% efectividad` : '0% efectividad',
      conteoEnProceso: sinDato ? '—' : enProceso.cantidad,
      montoEnProceso: `Potencial ${bs(enProceso.monto)}`,
      ticketPromedio: bs(ticket),
      conteoPerdidas: sinDato ? '—' : de('PERDIDA').cantidad,
    };
  });

  protected readonly chartMetodosPago = computed<ChartItem[]>(() =>
    this.resumen
      .value()
      .porMetodo.filter(g => g.clave !== null && g.cantidad > 0)
      .map(g => ({
        id: g.clave!,
        label: METODOS_PAGO.find(m => m.id === g.clave)?.label ?? g.clave!,
        value: g.cantidad,
        sublabel: this.moneda.formatearBob(g.monto),
      }))
      .sort((a, b) => b.value - a.value),
  );

  protected readonly chartModulos = computed<ChartItem[]>(() =>
    this.resumen
      .value()
      .porModulo.filter(g => g.cantidad > 0)
      .map(g => ({
        id: g.clave ?? SIN_MODULO,
        label: g.clave ?? 'Sin módulo',
        value: g.cantidad,
        sublabel: this.moneda.formatearBob(g.monto),
      }))
      .sort((a, b) => b.value - a.value),
  );
  /* ── Métodos de Filtro ─────────────────────────────────────────── */

  protected cambiarFiltro(nuevo: FiltroVenta): void {
    this.filtro.set(nuevo);
    this.pagina.set(1);
  }

  protected cambiarPresetPeriodo(preset: string): void {
    this.presetPeriodo.set(preset as PresetPeriodo);
    this.pagina.set(1);
  }

  protected cambiarAgente(val: string): void {
    this.agenteSeleccionadoId.set(val);
    this.pagina.set(1);
  }

  protected cambiarMetodoPagoFiltro(metodo: string): void {
    this.metodoPagoFiltro.set(metodo as MetodoPagoVenta | 'TODOS');
    this.pagina.set(1);
  }

  protected cambiarComprobanteFiltro(tipo: string): void {
    this.comprobanteFiltro.set(tipo as 'TODOS' | 'CON_COMPROBANTE' | 'SIN_COMPROBANTE');
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
    this.moduloFiltro.set(null);
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
      /* Antes escribía el módulo en el buscador, que no mira esa columna. */
      this.moduloFiltro.set(segmentId);
      this.pagina.set(1);
      this.vistaActiva.set('tabla');
    }
  }

  /* ── Cajón Lateral (Drawer de Detalle 360°) ────────────────────── */

  protected abrirDetalleVenta(venta: Venta, template?: TemplateRef<unknown>): void {
    const tpl = template ?? this.drawerDetalleTemplate();
    if (!tpl) return;
    this.ventaSeleccionada.set(venta);
    this.corrigiendoOrigen.set(false);
    this.activeDrawerRef?.dispose();
    this.activeDrawerRef = this.dialogService.abrirCajon(tpl, this.vcr, {
      onClose: () => this.cerrarDetalleVenta(),
    });
  }

  protected cerrarDetalleVenta(): void {
    this.ventaSeleccionada.set(null);
    this.corrigiendoOrigen.set(false);
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

  /** Ver `shared/models/telefono.ts`: el `591` que se anteponía acá rompía
   *  los números que ya traían su propio país. */
  protected readonly getWhatsappLink = enlaceWhatsApp;

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

  /* ── Corregir el origen de una venta registrada (CAMP-1) ────────── */

  protected alternarCorreccionOrigen(): void {
    this.corrigiendoOrigen.update(abierto => !abierto);
  }

  /**
   * Guarda el nuevo origen y refleja lo que el backend confirmó, no lo que se
   * pulsó.
   *
   * Si la llamada falla, la interfaz se queda como estaba —el origen anterior
   * sigue a la vista y el panel abierto— porque `ventaSeleccionada` solo se
   * reemplaza con la fila que devuelve el servidor. Fingir que guardó sería
   * peor aquí que en otros sitios: la agente cerraría el cajón convencida de
   * haber corregido la atribución.
   */
  protected async corregirOrigenDeLaVenta(leadId: string | null): Promise<void> {
    const venta = this.ventaSeleccionada();
    if (!venta || this.guardandoOrigen()) return;

    this.guardandoOrigen.set(true);
    try {
      const actualizada = await this.ventasService.corregirOrigen(venta.id, leadId);
      this.ventaSeleccionada.set(actualizada);
      this.corrigiendoOrigen.set(false);
      this.toastService.success(
        leadId ? 'Origen de la venta corregido' : 'Se quitó el origen de la venta',
        'Atribución actualizada',
      );
      this.ventas.reload();
    } catch (err: unknown) {
      this.toastService.error(
        mensajeDeError(err, 'No se pudo corregir el origen de la venta.'),
        'Error',
      );
    } finally {
      this.guardandoOrigen.set(false);
    }
  }
}
