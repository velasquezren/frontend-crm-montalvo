import { DecimalPipe } from '@angular/common';
import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';

import { mensajeDeError } from '../../core/api/http-error';
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
import { formatearBs, MonedaPipe } from '../../shared/pipes/moneda.pipe';
import {
  ESTADO_PERIODO_LABEL,
  MESES,
  PeriodoComision,
} from '../planilla-comisiones/planilla.model';
import { ServiciosService } from './servicios.service';
import { ServiciosHistorialDrawerComponent } from './components/servicios-historial-drawer/servicios-historial-drawer.component';
import { ServiciosMedicoDrawerComponent } from './components/servicios-medico-drawer/servicios-medico-drawer.component';
import { KpiCardComponent } from '../../shared/components/kpi-card/kpi-card.component';
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

type Pestana = 'DASHBOARD' | 'PACIENTES' | 'MEDICOS';

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

  protected readonly meses = MESES;
  protected readonly estadoLabel = ESTADO_PERIODO_LABEL;

  /* ── Estado de UI ───────────────────────────────────────────────────── */

  protected readonly pestana = signal<Pestana>('DASHBOARD');
  protected readonly filtroModulo = signal<string | null>(null);
  /** null = todo el historial; con id = solo ese mes. */
  protected readonly periodoId = signal<string | null>(null);

  protected readonly paginaPacientes = signal(1);
  protected readonly paginaMedicos = signal(1);
  protected readonly busquedaPacientes = signal('');
  protected readonly busquedaMedicos = signal('');

  /** Búsquedas con retardo: no se le pega al backend en cada tecla. */
  private readonly pacientesDebounced = signal('');
  private readonly medicosDebounced = signal('');

  protected readonly historial = signal<HistorialPaciente | null>(null);
  protected readonly perfilMedico = signal<PerfilMedico | null>(null);
  protected readonly cargandoHistorial = signal(false);
  protected readonly cargandoMedico = signal(false);

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

  protected readonly pacientes = httpResource<RespuestaPaginada<PacienteConServicios>>(
    () => this.service.pacientesRequest(this.paginaPacientes(), this.pacientesDebounced() || undefined),
    { defaultValue: paginaVacia<PacienteConServicios>() },
  );

  protected readonly medicos = httpResource<RespuestaPaginada<MedicoConServicios>>(
    () => this.service.medicosRequest(this.paginaMedicos(), this.medicosDebounced() || undefined),
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
        valor: formatearBs(d.totales.ingreso),
        icon: 'wallet' as const,
        tono: 'primary' as const,
        destacado: false,
        pie: `${formatearBs(ticket)} por servicio`,
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
        valor: formatearBs(g.saldoAcumulado),
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
        valor: String(h.resumen.servicios),
        icon: 'activity' as const,
        tono: 'secondary' as const,
        destacado: false,
        pie: '',
      },
      {
        label: 'Gastado',
        valor: formatearBs(h.resumen.gastado),
        icon: 'wallet' as const,
        tono: 'primary' as const,
        destacado: true,
        pie: `${formatearBs(ticket)} por servicio`,
      },
      {
        label: 'Médicos',
        valor: String(h.resumen.medicos),
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

  protected async abrirHistorial(pac: string | null): Promise<void> {
    if (!pac) return;
    this.cargandoHistorial.set(true);
    try {
      this.historial.set(await this.service.historialPaciente(pac));
    } catch (err) {
      this.toast.error(mensajeDeError(err, 'No se pudo cargar el historial.'), 'Error');
    } finally {
      this.cargandoHistorial.set(false);
    }
  }

  protected cerrarHistorial(): void {
    this.historial.set(null);
  }

  /**
   * Abre el perfil del médico. Antes la tabla de médicos era un callejón sin
   * salida: se veía el total de cada uno y no había forma de ver de qué se
   * componía.
   */
  protected async abrirMedico(codigo: string | null): Promise<void> {
    if (!codigo) return;
    this.cargandoMedico.set(true);
    try {
      this.perfilMedico.set(await this.service.perfilMedico(codigo));
    } catch (err) {
      this.toast.error(mensajeDeError(err, 'No se pudo cargar el perfil del médico.'), 'Error');
    } finally {
      this.cargandoMedico.set(false);
    }
  }

  protected cerrarMedico(): void {
    this.perfilMedico.set(null);
  }

  /**
   * Salta del perfil del médico al historial de uno de sus pacientes. Se cierra
   * el primero para no apilar dos cajones sobre el mismo fondo.
   */
  protected async verPacienteDelMedico(pac: string): Promise<void> {
    this.cerrarMedico();
    await this.abrirHistorial(pac);
  }
}
