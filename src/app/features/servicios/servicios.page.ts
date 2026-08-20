import { OverlayRef } from '@angular/cdk/overlay';
import { DecimalPipe } from '@angular/common';
import { httpResource } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  TemplateRef,
  ViewContainerRef,
  viewChild,
} from '@angular/core';

import { mensajeDeError } from '../../core/api/http-error';
import { DialogService } from '../../shared/components/dialog/dialog.service';
import { paginaVacia, RespuestaPaginada } from '../../core/api/pagination.model';
import { ToastService } from '../../core/toast/toast.service';
import { BadgeComponent } from '../../shared/components/badge/badge.component';
import { ButtonComponent } from '../../shared/components/button/button.component';
import { BarChartComponent, ChartItem } from '../../shared/components/charts/bar-chart.component';
import { DonutChartComponent } from '../../shared/components/charts/donut-chart.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { FilterChipComponent } from '../../shared/components/filter-chip/filter-chip.component';
import { IconComponent } from '../../shared/components/icon/icon.component';
import { InfoHintComponent } from '../../shared/components/info-hint/info-hint.component';
import { LoadingSkeletonComponent } from '../../shared/components/loading-skeleton/loading-skeleton.component';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { TableComponent } from '../../shared/components/table/table.component';
import { MonedaService } from '../../core/moneda/moneda.service';
import { MonedaPipe } from '../../shared/pipes/moneda.pipe';
import {
  ESTADO_PERIODO_LABEL,
  MESES,
  PeriodoComision,
} from '../planilla-comisiones/planilla.model';
import { generarIniciales } from '../../core/auth/user.model';
import { ServiciosService } from './servicios.service';
import { ServiciosHistorialDrawerComponent } from './components/servicios-historial-drawer/servicios-historial-drawer.component';
import { ServiciosMedicoDrawerComponent } from './components/servicios-medico-drawer/servicios-medico-drawer.component';
import { KpiCardComponent } from '../../shared/components/kpi-card/kpi-card.component';
import { DireccionOrden } from '../../shared/components/table/th-ordenable.component';
import { ServiciosKpisComponent } from './components/servicios-kpis/servicios-kpis.component';
import { ServiciosMedicosTablaComponent } from './components/servicios-medicos-tabla/servicios-medicos-tabla.component';
import { ServiciosModulosComponent } from './components/servicios-modulos/servicios-modulos.component';
import { ServiciosPacientesTablaComponent } from './components/servicios-pacientes-tabla/servicios-pacientes-tabla.component';
import {
  DashboardServicios,
  Demografia,
  HistorialPaciente,
  PerfilMedico,
  MedicoConServicios,
  PacienteConServicios,
} from './servicios.model';

export type Pestana = 'DASHBOARD' | 'PACIENTES' | 'MEDICOS';

export interface TabServicioConfig {
  readonly id: Pestana;
  readonly label: string;
  readonly icon: 'bar-chart' | 'users' | 'briefcase';
  readonly descripcion: string;
}

const TABS_SERVICIOS: readonly TabServicioConfig[] = [
  {
    id: 'DASHBOARD',
    label: 'Resumen General',
    icon: 'bar-chart',
    descripcion: 'Volumen clínico, módulos y especialidades',
  },
  {
    id: 'PACIENTES',
    label: 'Directorio de Pacientes',
    icon: 'users',
    descripcion: 'Historial individual y atenciones clínicas',
  },
  {
    id: 'MEDICOS',
    label: 'Equipo Médico',
    icon: 'briefcase',
    descripcion: 'Rendimiento y atenciones por profesional',
  },
];

/**
 * Historial de Servicios — qué se hizo en la clínica, a quién y quién lo hizo.
 *
 * Se alimenta del mismo Excel mensual que la planilla de comisiones, pero solo
 * lee: nada de esta pantalla puede alterar una liquidación.
 */
@Component({
  selector: 'app-servicios',
  imports: [
    DecimalPipe,
    MonedaPipe,
    BadgeComponent,
    BarChartComponent,
    ButtonComponent,
    DonutChartComponent,
    EmptyStateComponent,
    FilterChipComponent,
    IconComponent,
    InfoHintComponent,
    LoadingSkeletonComponent,
    PageHeaderComponent,
    TableComponent,
    ServiciosKpisComponent,
    ServiciosModulosComponent,
    ServiciosPacientesTablaComponent,
    ServiciosMedicosTablaComponent,
    ServiciosHistorialDrawerComponent,
    ServiciosMedicoDrawerComponent,
    KpiCardComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './servicios.page.html',
  styleUrl: './servicios.page.css',
})
export class ServiciosPage {
  private readonly service = inject(ServiciosService);
  private readonly toast = inject(ToastService);
  protected readonly monedaService = inject(MonedaService);

  protected readonly meses = MESES;
  protected readonly estadoLabel = ESTADO_PERIODO_LABEL;
  protected readonly tabs = TABS_SERVICIOS;
  protected readonly iniciales = generarIniciales;

  /* ── Estado de UI ───────────────────────────────────────────────────── */

  protected readonly pestana = signal<Pestana>('DASHBOARD');
  protected readonly filtroModulo = signal<string | null>(null);
  /** null = todo el historial; con id = solo ese mes. */
  protected readonly periodoId = signal<string | null>(null);

  /** Pestañas ya visitadas para retención instantánea de estado (0ms). */
  private readonly visitadas = signal<ReadonlySet<Pestana>>(new Set(['DASHBOARD']));

  protected readonly estaMontada = computed(() => {
    const vistas = new Set(this.visitadas());
    vistas.add(this.pestana());
    return (tab: Pestana): boolean => vistas.has(tab);
  });

  protected readonly paginaPacientes = signal(1);
  protected readonly paginaMedicos = signal(1);
  protected readonly busquedaPacientes = signal('');
  protected readonly busquedaMedicos = signal('');

  /** Búsquedas con retardo: no se le pega al backend en cada tecla. */
  private readonly pacientesDebounced = signal('');
  private readonly medicosDebounced = signal('');

  /* Un orden por listado: el de pacientes y el de médicos son tablas distintas
     y compartirlo haría que ordenar una descolocara la otra. */
  protected readonly ordenPacientes = signal<string | undefined>(undefined);
  protected readonly direccionPacientes = signal<DireccionOrden>('desc');
  protected readonly ordenMedicos = signal<string | undefined>(undefined);
  protected readonly direccionMedicos = signal<DireccionOrden>('desc');

  protected readonly historial = signal<HistorialPaciente | null>(null);
  protected readonly perfilMedico = signal<PerfilMedico | null>(null);
  protected readonly cargandoHistorial = signal(false);
  protected readonly cargandoMedico = signal(false);

  /* ── Cajones laterales ──────────────────────────────────────────────────
   *
   * Van por DialogService (CDK Overlay), que los proyecta a document.body.
   * Antes eran un `@if` con `fixed inset-0 z-40` dentro de la plantilla, y por
   * eso el header (z-30), el sidebar (z-40), la barra inferior de móvil (z-60)
   * y el FAB (z-100) se dibujaban ENCIMA del cajón: nunca fue un z-index mal
   * elegido, era un cajón atrapado en el árbol de la página. Es exactamente lo
   * que el skill crm-feature-page prohíbe.
   */
  private readonly dialogService = inject(DialogService);
  private readonly vcr = inject(ViewContainerRef);
  private readonly plantillaHistorial = viewChild<TemplateRef<unknown>>('cajonHistorial');
  private readonly plantillaMedico = viewChild<TemplateRef<unknown>>('cajonMedico');
  private overlayHistorial: OverlayRef | null = null;
  private overlayMedico: OverlayRef | null = null;

  constructor() {
    effect(onCleanup => {
      const texto = this.busquedaPacientes();
      const id = setTimeout(() => {
        this.pacientesDebounced.set(texto);
        this.paginaPacientes.set(1);
      }, 350);
      onCleanup(() => clearTimeout(id));
    });

    effect(onCleanup => {
      const texto = this.busquedaMedicos();
      const id = setTimeout(() => {
        this.medicosDebounced.set(texto);
        this.paginaMedicos.set(1);
      }, 350);
      onCleanup(() => clearTimeout(id));
    });
  }

  /* ── Recursos ───────────────────────────────────────────────────────── */

  /** Meses importados, para el selector de la barra superior. */
  protected readonly periodos = httpResource<RespuestaPaginada<PeriodoComision>>(
    () => this.service.periodosRequest(),
    { defaultValue: paginaVacia<PeriodoComision>() },
  );

  protected readonly dashboard = httpResource<DashboardServicios | null>(
    () =>
      this.service.dashboardRequest({
        modulo: this.filtroModulo() ?? undefined,
        periodoId: this.periodoId() ?? undefined,
      }),
    { defaultValue: null },
  );

  protected readonly demografia = httpResource<Demografia | null>(
    () => this.service.demografiaRequest(),
    { defaultValue: null },
  );

  /*
   * Las listas de pestaña se piden al entrar EN su pestaña, no al entrar en la
   * vista. La página abre en DASHBOARD, así que pedir las otras dos por
   * adelantado eran dos peticiones que nadie estaba mirando —y la de pacientes
   * pagina sobre 15.000 fichas—, compitiendo por el único núcleo del servidor
   * justo mientras se cargan los gráficos que sí se ven.
   *
   * Al cambiar de pestaña la petición sale en ese momento: es un viaje de red,
   * y el componente ya tiene su estado de carga.
   */
  protected readonly pacientes = httpResource<RespuestaPaginada<PacienteConServicios>>(
    () =>
      this.estaMontada()('PACIENTES')
        ? this.service.pacientesRequest(
            this.paginaPacientes(),
            this.pacientesDebounced() || undefined,
            this.ordenPacientes(),
            this.direccionPacientes(),
          )
        : undefined,
    { defaultValue: paginaVacia<PacienteConServicios>() },
  );

  protected readonly medicos = httpResource<RespuestaPaginada<MedicoConServicios>>(
    () =>
      this.estaMontada()('MEDICOS')
        ? this.service.medicosRequest(
            this.paginaMedicos(),
            this.medicosDebounced() || undefined,
            this.ordenMedicos(),
            this.direccionMedicos(),
          )
        : undefined,
    { defaultValue: paginaVacia<MedicoConServicios>() },
  );

  /* ── Derivados para los gráficos ────────────────────────────────────── */

  private serie(filas: ReadonlyArray<{ etiqueta: string; total: number }>): ChartItem[] {
    return filas.map(f => ({ label: f.etiqueta, value: f.total }));
  }

  protected readonly serieModulos = computed(() =>
    this.serie(this.dashboard.value()?.porModulo ?? []),
  );
  protected readonly serieClasif = computed(() =>
    this.serie(this.dashboard.value()?.porClasif ?? []),
  );
  protected readonly serieSexo = computed(() => this.serie(this.demografia.value()?.porSexo ?? []));
  protected readonly serieEdad = computed(() =>
    this.serie(this.demografia.value()?.porTramoEdad ?? []),
  );

  /** Solo los departamentos con peso: la cola larga ensucia el gráfico. */
  protected readonly serieDepartamento = computed(() =>
    this.serie((this.demografia.value()?.porDepartamento ?? []).slice(0, 8)),
  );

  protected readonly serieTopServicios = computed<ChartItem[]>(() =>
    (this.dashboard.value()?.topServicios ?? []).map(s => ({
      label: s.etiqueta,
      value: s.total,
      sublabel: `${s.ingreso.toLocaleString('es-BO', { maximumFractionDigits: 0 })}`,
    })),
  );

  protected readonly serieMeses = computed<ChartItem[]>(() =>
    (this.dashboard.value()?.porMes ?? []).map(m => ({
      label: `${this.nombreMes(m.mes).slice(0, 3)} ${m.anio}`,
      value: m.total,
    })),
  );

  /**
   * Tarjetas de resumen, en el mismo formato que Ventas y Comisiones
   * (`{ label, valor, icon }`): así las tres pantallas comparten literalmente el
   * mismo bloque de marcado y no hay dos maneras de pintar un KPI en el CRM.
   */
  /**
   * Cifras de cabecera, con el mismo contrato que Reportes: además del número,
   * cada tarjeta lleva un **pie con contexto**. Un dato suelto no dice nada —
   * "1.287 servicios" cobra sentido junto a "en 3 meses cargados".
   */
  protected readonly resumen = computed(() => {
    const d = this.dashboard.value();
    if (!d) return [];

    const meses = d.porMes.length;
    const promedio = meses > 0 ? Math.round(d.totales.servicios / meses) : 0;
    const ticket = d.totales.servicios > 0 ? d.totales.ingreso / d.totales.servicios : 0;

    return [
      {
        label: 'Servicios',
        valor: d.totales.servicios.toLocaleString('es-BO'),
        icon: 'activity' as const,
        tono: 'primary' as const,
        destacado: true,
        pie: `${promedio.toLocaleString('es-BO')} al mes · ${meses} ${meses === 1 ? 'mes cargado' : 'meses cargados'}`,
      },
      {
        label: 'Pacientes atendidos',
        valor: d.totales.pacientes.toLocaleString('es-BO'),
        icon: 'users' as const,
        tono: 'secondary' as const,
        destacado: false,
        pie: `${(d.totales.pacientes > 0 ? d.totales.servicios / d.totales.pacientes : 0).toFixed(1)} servicios por paciente`,
      },
      {
        label: 'Médicos',
        valor: d.totales.medicos.toLocaleString('es-BO'),
        icon: 'briefcase' as const,
        tono: 'neutral' as const,
        destacado: false,
        pie: 'con al menos una atención',
      },
      {
        label: 'Facturado',
        valor: this.monedaService.formatear(d.totales.ingreso, 'USD', this.periodoActual() ? +this.periodoActual()!.tipoCambio : undefined),
        icon: 'wallet' as const,
        tono: 'primary' as const,
        destacado: false,
        pie: `${this.monedaService.formatear(ticket, 'USD', this.periodoActual() ? +this.periodoActual()!.tipoCambio : undefined)} por servicio`,
      },
    ];
  });

  protected readonly resumenDemografia = computed(() => {
    const g = this.demografia.value();
    if (!g) return [];
    const mayoria = g.porDepartamento[0];
    const pctMayoria = mayoria && g.total > 0 ? Math.round((mayoria.total / g.total) * 100) : 0;

    return [
      {
        label: 'Fichas registradas',
        valor: g.total.toLocaleString('es-BO'),
        icon: 'users' as const,
        tono: 'primary' as const,
        destacado: false,
        pie: mayoria ? `${pctMayoria}% de ${mayoria.etiqueta}` : '',
      },
      {
        label: 'Visitas promedio',
        valor: g.visitasPromedio.toFixed(1),
        icon: 'trending-up' as const,
        tono: 'secondary' as const,
        destacado: false,
        pie: 'por paciente, según el sistema antiguo',
      },
      {
        label: 'Saldo arrastrado',
        valor: this.monedaService.formatear(g.saldoAcumulado, 'USD'),
        icon: 'wallet' as const,
        tono: 'neutral' as const,
        destacado: false,
        pie: 'pendiente del sistema antiguo',
      },
    ];
  });

  protected readonly resumenHistorial = computed(() => {
    const h = this.historial();
    if (!h) return [];
    const ticket = h.resumen.servicios > 0 ? h.resumen.gastado / h.resumen.servicios : 0;

    return [
      {
        label: 'Servicios',
        valor: h.resumen.servicios,
        icon: 'activity' as const,
        tono: 'secondary' as const,
        destacado: false,
        pie: '',
      },
      {
        label: 'Gastado',
        valor: this.monedaService.formatear(h.resumen.gastado, 'USD'),
        icon: 'wallet' as const,
        tono: 'primary' as const,
        destacado: true,
        pie: `${this.monedaService.formatear(ticket, 'USD')} por servicio`,
      },
      {
        /* Mientras carga, la tabla no sabe cuántos médicos lo atendieron: un 0
           sería un dato falso durante medio segundo, y además parpadearía al
           corregirse. Un guion dice "todavía no lo sé", que es la verdad. */
        label: 'Médicos',
        valor: this.cargandoHistorial() ? '—' : h.resumen.medicos,
        icon: 'briefcase' as const,
        tono: 'neutral' as const,
        destacado: false,
        pie: 'lo atendieron',
      },
    ];
  });

  /** Peso de cada médico sobre el total, para la columna de porcentaje. */
  protected readonly pctDelTotal = computed(() => {
    const d = this.dashboard.value();
    const total = d?.totales.servicios ?? 0;
    return (n: number) => (total > 0 ? Math.round((n / total) * 100) : 0);
  });

  /** Módulos que existen en los datos, para los filtros. */
  protected readonly modulosDisponibles = computed(() =>
    (this.dashboard.value()?.porModulo ?? []).map(m => ({ etiqueta: m.etiqueta, total: m.total })),
  );

  /** Qué parte de los servicios llega a enlazar con una ficha del CRM. */
  protected readonly pctCobertura = computed(() => {
    const c = this.dashboard.value()?.cobertura;
    if (!c || c.servicios === 0) return 0;
    return Math.round((c.conFicha / c.servicios) * 100);
  });

  /* ── Acciones ───────────────────────────────────────────────────────── */

  protected readonly periodoActual = computed(() =>
    this.periodos.value().datos.find(p => p.id === this.periodoId()) ?? null,
  );

  /** Desglose por módulo como sub-tarjetas, con su peso sobre el total. */
  protected readonly desgloseModulos = computed(() => {
    const d = this.dashboard.value();
    if (!d) return [];
    const total = d.totales.servicios || 1;
    return d.porModulo.map(m => ({
      etiqueta: m.etiqueta,
      total: m.total,
      ingreso: m.ingreso,
      pct: Math.round((m.total / total) * 100),
    }));
  });

  protected seleccionarPeriodo(id: string): void {
    this.periodoId.set(id || null);
  }

  protected setPestana(p: Pestana): void {
    if (this.pestana() === p) return;
    this.visitadas.update(vistas => new Set(vistas).add(this.pestana()).add(p));
    this.pestana.set(p);
  }

  protected nombreMes(mes: number): string {
    return this.meses[mes - 1] ?? String(mes);
  }

  /**
   * El filtro por módulo es un interruptor: volver a tocar el activo lo quita.
   * Evita tener que añadir un chip de "todos" que ocupa sitio.
   */
  protected alternarModulo(modulo: string): void {
    this.filtroModulo.update(actual => (actual === modulo ? null : modulo));
  }

  /**
   * Abre el cajón AL INSTANTE y pide el detalle después.
   *
   * Antes se esperaba la respuesta para abrir: tocar un paciente no producía
   * nada visible durante todo el viaje al servidor (~190 ms desde Bolivia, más
   * en móvil), y ni siquiera había spinner —`cargandoHistorial` se ponía a true
   * pero no se pintaba en ninguna parte—. Se sentía como que el clic no había
   * funcionado, y la reacción natural es volver a tocar.
   *
   * La tabla ya tiene en memoria el nombre, el código, el número de servicios y
   * lo gastado: con eso la cabecera y los KPIs salen completos de entrada, y
   * solo la ficha y la línea de tiempo esperan al servidor, ya dentro del cajón
   * abierto. Es la regla de `crm-feature-page`: derivar en memoria lo que ya
   * tienes y reservar la petición para lo que de verdad no está.
   */
  protected async abrirHistorial(pac: string | null): Promise<void> {
    if (!pac) return;

    const fila = this.pacientes.value().datos.find(p => p.pac === pac);
    this.historial.set(this.historialProvisional(pac, fila));
    this.cargandoHistorial.set(true);
    this.overlayHistorial = this.abrirCajon(this.plantillaHistorial(), this.overlayHistorial, () =>
      this.cerrarHistorial(),
    );

    try {
      this.historial.set(await this.service.historialPaciente(pac));
    } catch (err) {
      this.cerrarHistorial();
      this.toast.error(mensajeDeError(err, 'No se pudo cargar el historial.'), 'Error');
    } finally {
      this.cargandoHistorial.set(false);
    }
  }

  /**
   * Historial "de mentira" con lo que la fila ya sabe, para pintar el cajón sin
   * esperar. `medicos` queda en 0 porque la tabla no lo trae; mientras
   * `cargandoHistorial` esté activo, `resumenHistorial` lo muestra como «—» en
   * vez de afirmar que no le atendió nadie.
   *
   * Si el paciente no está en la página cargada —se llega desde el perfil de un
   * médico— se abre igual, solo que con la cabecera más pobre.
   */
  private historialProvisional(
    pac: string,
    fila: PacienteConServicios | undefined,
  ): HistorialPaciente {
    return {
      pac,
      nombre: fila?.paciente ?? pac,
      ficha: null,
      resumen: {
        servicios: fila?.servicios ?? 0,
        gastado: fila?.gastado ?? 0,
        primeraVisita: null,
        ultimaVisita: fila?.ultimaVisita ?? null,
        medicos: 0,
      },
      servicios: [],
    };
  }

  /** Abre un cajón lateral, reemplazando el que hubiera abierto. */
  private abrirCajon(
    plantilla: TemplateRef<unknown> | undefined,
    anterior: OverlayRef | null,
    alCerrar: () => void,
  ): OverlayRef | null {
    if (!plantilla) return anterior;
    anterior?.dispose();

    const ref = this.dialogService.openTemplate(plantilla, this.vcr, {
      /* `justify-end` lo pega al borde derecho; `pointer-events-none` deja que
         el clic atraviese hasta el backdrop, y el <aside> lo reactiva. */
      panelClass: ['fixed', 'inset-0', 'z-[101]', 'flex', 'justify-end', 'pointer-events-none'],
    });
    /* `openTemplate` ya destruye el overlay al tocar el fondo; esto además
       limpia la señal, que es lo que decide si el cajón debe existir. */
    ref.backdropClick().subscribe(() => alCerrar());
    return ref;
  }

  protected ordenarPacientes(e: { orden: string; direccion: DireccionOrden }): void {
    this.ordenPacientes.set(e.orden);
    this.direccionPacientes.set(e.direccion);
    this.paginaPacientes.set(1);
  }

  protected ordenarMedicos(e: { orden: string; direccion: DireccionOrden }): void {
    this.ordenMedicos.set(e.orden);
    this.direccionMedicos.set(e.direccion);
    this.paginaMedicos.set(1);
  }

  protected cerrarHistorial(): void {
    this.historial.set(null);
    this.overlayHistorial?.dispose();
    this.overlayHistorial = null;
  }

  /**
   * Abre el perfil del médico. Antes la tabla de médicos era un callejón sin
   * salida: se veía el total de cada uno y no había forma de ver de qué se
   * componía.
   */
  protected async abrirMedico(codigo: string | null): Promise<void> {
    if (!codigo) return;

    const fila = this.medicos.value().datos.find(m => m.codigo === codigo);
    this.perfilMedico.set(this.perfilProvisional(codigo, fila));
    this.cargandoMedico.set(true);
    this.overlayMedico = this.abrirCajon(this.plantillaMedico(), this.overlayMedico, () =>
      this.cerrarMedico(),
    );

    try {
      this.perfilMedico.set(await this.service.perfilMedico(codigo));
    } catch (err) {
      this.cerrarMedico();
      this.toast.error(mensajeDeError(err, 'No se pudo cargar el perfil del médico.'), 'Error');
    } finally {
      this.cargandoMedico.set(false);
    }
  }

  /**
   * Perfil provisional con lo que la fila del médico ya trae. Aquí los tres KPI
   * salen completos —incluido el ticket promedio, que es facturado ÷ servicios—
   * así que la cabecera del cajón no cambia cuando llega la respuesta: solo se
   * rellenan las listas de abajo.
   */
  private perfilProvisional(
    codigo: string,
    fila: MedicoConServicios | undefined,
  ): PerfilMedico {
    const servicios = fila?.servicios ?? 0;
    const ingreso = fila?.ingreso ?? 0;

    return {
      codigo,
      nombre: fila?.nombre ?? codigo,
      resumen: {
        servicios,
        pacientes: fila?.pacientes ?? 0,
        ingreso,
        ticketPromedio: servicios > 0 ? ingreso / servicios : 0,
        primeraAtencion: null,
        ultimaAtencion: fila?.ultimaAtencion ?? null,
      },
      porModulo: [],
      topServicios: [],
      porMes: [],
      topPacientes: [],
    };
  }

  protected cerrarMedico(): void {
    this.perfilMedico.set(null);
    this.overlayMedico?.dispose();
    this.overlayMedico = null;
  }

  /**
   * Salta del perfil del médico al historial de uno de sus pacientes. Se cierra
   * el primero para no apilar dos cajones sobre el mismo fondo.
   */
  protected async verPacienteDelMedico(pac: string): Promise<void> {
    this.cerrarMedico();
    await this.abrirHistorial(pac);
  }

  /**
   * Salta del historial del paciente al perfil 360° del médico tratante.
   */
  protected async verMedicoDelHistorial(codigo: string): Promise<void> {
    this.cerrarHistorial();
    await this.abrirMedico(codigo);
  }
}
