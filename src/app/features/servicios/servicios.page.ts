import { DatePipe, DecimalPipe } from '@angular/common';
import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';

import { mensajeDeError } from '../../core/api/http-error';
import { paginaVacia, RespuestaPaginada } from '../../core/api/pagination.model';
import { ToastService } from '../../core/toast/toast.service';
import { BadgeComponent } from '../../shared/components/badge/badge.component';
import { ButtonComponent } from '../../shared/components/button/button.component';
import { CardComponent } from '../../shared/components/card/card.component';
import { BarChartComponent, ChartItem } from '../../shared/components/charts/bar-chart.component';
import { DonutChartComponent } from '../../shared/components/charts/donut-chart.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { FilterChipComponent } from '../../shared/components/filter-chip/filter-chip.component';
import { IconComponent } from '../../shared/components/icon/icon.component';
import { InfoHintComponent } from '../../shared/components/info-hint/info-hint.component';
import { InputComponent } from '../../shared/components/input/input.component';
import { LoadingSkeletonComponent } from '../../shared/components/loading-skeleton/loading-skeleton.component';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { PaginatorComponent } from '../../shared/components/paginator/paginator.component';
import { TableComponent } from '../../shared/components/table/table.component';
import { formatearBs, MonedaPipe } from '../../shared/pipes/moneda.pipe';
import { MESES } from '../planilla-comisiones/planilla.model';
import { ServiciosService } from './servicios.service';
import {
  DashboardServicios,
  Demografia,
  HistorialPaciente,
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
    DatePipe,
    DecimalPipe,
    MonedaPipe,
    BadgeComponent,
    BarChartComponent,
    ButtonComponent,
    CardComponent,
    DonutChartComponent,
    EmptyStateComponent,
    FilterChipComponent,
    IconComponent,
    InfoHintComponent,
    InputComponent,
    LoadingSkeletonComponent,
    PageHeaderComponent,
    PaginatorComponent,
    TableComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './servicios.page.html',
  styleUrl: './servicios.page.css',
})
export class ServiciosPage {
  private readonly service = inject(ServiciosService);
  private readonly toast = inject(ToastService);

  protected readonly meses = MESES;

  /* ── Estado de UI ───────────────────────────────────────────────────── */

  protected readonly pestana = signal<Pestana>('DASHBOARD');
  protected readonly filtroModulo = signal<string | null>(null);

  protected readonly paginaPacientes = signal(1);
  protected readonly paginaMedicos = signal(1);
  protected readonly busquedaPacientes = signal('');
  protected readonly busquedaMedicos = signal('');

  /** Búsquedas con retardo: no se le pega al backend en cada tecla. */
  private readonly pacientesDebounced = signal('');
  private readonly medicosDebounced = signal('');

  protected readonly historial = signal<HistorialPaciente | null>(null);
  protected readonly cargandoHistorial = signal(false);

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

  protected readonly dashboard = httpResource<DashboardServicios | null>(
    () => this.service.dashboardRequest({ modulo: this.filtroModulo() ?? undefined }),
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
  protected readonly resumen = computed(() => {
    const d = this.dashboard.value();
    if (!d) return [];
    return [
      { label: 'Servicios', valor: d.totales.servicios.toLocaleString('es-BO'), icon: 'activity' as const },
      { label: 'Pacientes atendidos', valor: d.totales.pacientes.toLocaleString('es-BO'), icon: 'users' as const },
      { label: 'Médicos', valor: d.totales.medicos.toLocaleString('es-BO'), icon: 'briefcase' as const },
      { label: 'Facturado', valor: formatearBs(d.totales.ingreso), icon: 'wallet' as const },
    ];
  });

  protected readonly resumenDemografia = computed(() => {
    const g = this.demografia.value();
    if (!g) return [];
    return [
      { label: 'Fichas registradas', valor: g.total.toLocaleString('es-BO'), icon: 'users' as const },
      { label: 'Visitas promedio', valor: g.visitasPromedio.toFixed(1), icon: 'trending-up' as const },
      { label: 'Saldo arrastrado', valor: formatearBs(g.saldoAcumulado), icon: 'wallet' as const },
    ];
  });

  protected readonly resumenHistorial = computed(() => {
    const h = this.historial();
    if (!h) return [];
    return [
      { label: 'Servicios', valor: String(h.resumen.servicios), icon: 'activity' as const },
      { label: 'Gastado', valor: formatearBs(h.resumen.gastado), icon: 'wallet' as const },
      { label: 'Médicos', valor: String(h.resumen.medicos), icon: 'briefcase' as const },
    ];
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

  /** Lleva el listado de pacientes a un médico concreto. */
  protected verPacientesDe(nombre: string | null): void {
    if (!nombre) return;
    this.busquedaMedicos.set('');
    this.pestana.set('PACIENTES');
  }
}
