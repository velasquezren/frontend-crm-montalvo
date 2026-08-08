import { DecimalPipe } from '@angular/common';
import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';

import { mensajeDeError } from '../../core/api/http-error';
import { paginaVacia, RespuestaPaginada } from '../../core/api/pagination.model';
import { ToastService } from '../../core/toast/toast.service';
import { BadgeComponent } from '../../shared/components/badge/badge.component';
import { ButtonComponent } from '../../shared/components/button/button.component';
import { BarChartComponent, ChartItem } from '../../shared/components/charts/bar-chart.component';
import { DonutChartComponent } from '../../shared/components/charts/donut-chart.component';
import { ErrorCargaComponent } from '../../shared/components/error-carga/error-carga.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { IconComponent } from '../../shared/components/icon/icon.component';
import { KpiCardComponent } from '../../shared/components/kpi-card/kpi-card.component';
import { LoadingSkeletonComponent } from '../../shared/components/loading-skeleton/loading-skeleton.component';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { TableComponent } from '../../shared/components/table/table.component';
import { MonedaPipe } from '../../shared/pipes/moneda.pipe';
import {
  ESTADO_PERIODO_LABEL,
  MESES,
  PeriodoComision,
  ReporteConsolidado,
} from '../planilla-comisiones/planilla.model';
import { ReportesService } from './reportes.service';
import { AnaliticaPeriodo, FilaRanking, Porcion } from './reportes.model';

/** Paleta de las series — tokens de la paleta cerrada, no hex sueltos. */
const COLORES = [
  'var(--color-primary)',
  'var(--color-secondary)',
  'var(--color-info)',
  'var(--color-success)',
  'var(--color-critical)',
  'var(--color-neutral)',
];

type ColClasif = 'etiqueta' | 'cantidad' | 'montoVendido' | 'baseCalculo' | 'pctMonto';
type ColRanking = 'etiqueta' | 'cantidad' | 'montoVendido' | 'pctMonto';

/**
 * Informe Mensual de Comisiones.
 *
 * Solo muestra lo que llega en el Excel de FileMaker: qué se vendió, de qué
 * categoría, por qué canal, quién lo hizo y cómo evolucionó el mes. La
 * captación de leads se mira en el Dashboard — no se repite aquí.
 */
@Component({
  selector: 'app-reportes',
  imports: [
    DecimalPipe,
    MonedaPipe,
    BadgeComponent,
    ButtonComponent,
    BarChartComponent,
    DonutChartComponent,
    EmptyStateComponent,
    ErrorCargaComponent,
    IconComponent,
    KpiCardComponent,
    LoadingSkeletonComponent,
    PageHeaderComponent,
    TableComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './reportes.page.html',
  styleUrl: './reportes.page.css',
})
export class ReportesPage {
  private readonly service = inject(ReportesService);
  private readonly toast = inject(ToastService);

  protected readonly descargando = signal(false);

  protected readonly meses = MESES;
  protected readonly estadoLabel = ESTADO_PERIODO_LABEL;

  protected readonly periodoId = signal<string | null>(null);

  /* ── Estado de ordenamiento local (Listas cortas completas del informe) ─ */

  protected readonly sortClasifCol = signal<ColClasif>('montoVendido');
  protected readonly sortClasifDir = signal<'asc' | 'desc'>('desc');

  protected readonly sortServiciosCol = signal<ColRanking>('montoVendido');
  protected readonly sortServiciosDir = signal<'asc' | 'desc'>('desc');

  protected readonly sortMedicosCol = signal<ColRanking>('montoVendido');
  protected readonly sortMedicosDir = signal<'asc' | 'desc'>('desc');

  /* ── Recursos ───────────────────────────────────────────────────────── */

  protected readonly periodos = httpResource<RespuestaPaginada<PeriodoComision>>(
    () => this.service.periodosRequest(),
    { defaultValue: paginaVacia<PeriodoComision>() },
  );

  protected readonly analitica = httpResource<AnaliticaPeriodo | undefined>(
    () => {
      const id = this.periodoIdEfectivo();
      return id ? this.service.analiticaRequest(id) : undefined;
    },
    { defaultValue: undefined },
  );

  protected readonly consolidado = httpResource<ReporteConsolidado | undefined>(
    () => {
      const id = this.periodoIdEfectivo();
      return id ? this.service.consolidadoRequest(id) : undefined;
    },
    { defaultValue: undefined },
  );

  /* ── Derivados ──────────────────────────────────────────────────────── */

  /** Si nadie eligió mes, se abre el más reciente: el panel nunca arranca vacío. */
  protected readonly periodoIdEfectivo = computed(
    () => this.periodoId() ?? this.periodos.value().datos[0]?.id ?? null,
  );

  protected readonly periodoActual = computed(() => {
    const id = this.periodoIdEfectivo();
    return this.periodos.value().datos.find(p => p.id === id) ?? null;
  });

  protected readonly hayDatos = computed(() => this.analitica.value() !== undefined);

  /** El consolidado solo existe si el mes ya se calculó. */
  protected readonly liquidacionLista = computed(
    () => (this.analitica.value()?.resumen.vendedorasLiquidadas ?? 0) > 0,
  );

  /* ── Derivados Ordenados (Listas cortas completas, inmutables) ─────── */

  protected readonly porClasificacionOrdenadas = computed<readonly Porcion[]>(() => {
    const list = this.analitica.value()?.porClasificacion ?? [];
    const col = this.sortClasifCol();
    const mult = this.sortClasifDir() === 'asc' ? 1 : -1;
    return [...list].sort((a, b) => {
      const valA = a[col];
      const valB = b[col];
      if (typeof valA === 'string' && typeof valB === 'string') {
        return valA.localeCompare(valB) * mult;
      }
      return ((valA as number) - (valB as number)) * mult;
    });
  });

  protected readonly topServiciosOrdenados = computed<readonly FilaRanking[]>(() => {
    const list = this.analitica.value()?.topServicios ?? [];
    const col = this.sortServiciosCol();
    const mult = this.sortServiciosDir() === 'asc' ? 1 : -1;
    return [...list].sort((a, b) => {
      const valA = a[col];
      const valB = b[col];
      if (typeof valA === 'string' && typeof valB === 'string') {
        return valA.localeCompare(valB) * mult;
      }
      return ((valA as number) - (valB as number)) * mult;
    });
  });

  protected readonly topMedicosOrdenados = computed<readonly FilaRanking[]>(() => {
    const list = this.analitica.value()?.topMedicos ?? [];
    const col = this.sortMedicosCol();
    const mult = this.sortMedicosDir() === 'asc' ? 1 : -1;
    return [...list].sort((a, b) => {
      const valA = a[col];
      const valB = b[col];
      if (typeof valA === 'string' && typeof valB === 'string') {
        return valA.localeCompare(valB) * mult;
      }
      return ((valA as number) - (valB as number)) * mult;
    });
  });

  /* ── Series de los gráficos ─────────────────────────────────────────── */

  protected readonly serieCategorias = computed(() =>
    this.aSerie(this.analitica.value()?.porClasificacion),
  );
  protected readonly serieCanal = computed(() => this.aSerie(this.analitica.value()?.porCanal));
  protected readonly serieModulo = computed(() => this.aSerie(this.analitica.value()?.porModulo));
  protected readonly serieUnidad = computed(() =>
    this.aSerie(this.analitica.value()?.porUnidadNegocio),
  );
  protected readonly serieNivel = computed(() => this.aSerie(this.analitica.value()?.porNivelPlan));

  /** Evolución diaria: se muestra solo el día del mes para que quepan las etiquetas. */
  protected readonly serieDiaria = computed<ChartItem[]>(() =>
    (this.analitica.value()?.porDia ?? []).map(d => ({
      label: d.dia.slice(8, 10),
      value: d.montoVendido,
      sublabel: `${d.cantidad} venta${d.cantidad === 1 ? '' : 's'}`,
    })),
  );

  /* ── Acciones ───────────────────────────────────────────────────────── */

  protected ordenarClasif(col: ColClasif): void {
    if (this.sortClasifCol() === col) {
      this.sortClasifDir.update(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      this.sortClasifCol.set(col);
      this.sortClasifDir.set('desc');
    }
  }

  protected ordenarServicios(col: ColRanking): void {
    if (this.sortServiciosCol() === col) {
      this.sortServiciosDir.update(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      this.sortServiciosCol.set(col);
      this.sortServiciosDir.set('desc');
    }
  }

  protected ordenarMedicos(col: ColRanking): void {
    if (this.sortMedicosCol() === col) {
      this.sortMedicosDir.update(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      this.sortMedicosCol.set(col);
      this.sortMedicosDir.set('desc');
    }
  }

  /** Descarga el informe del mes en Excel y lo entrega al navegador. */
  protected async descargarExcel(): Promise<void> {
    const id = this.periodoIdEfectivo();
    if (!id || this.descargando()) return;

    this.descargando.set(true);
    try {
      const { blob, nombre } = await this.service.descargarExcel(id);
      const url = URL.createObjectURL(blob);
      const enlace = document.createElement('a');
      enlace.href = url;
      enlace.download = nombre;
      enlace.click();
      // Sin revocar, el blob queda retenido en memoria hasta recargar la página.
      URL.revokeObjectURL(url);
      this.toast.success(`${nombre} descargado.`, 'Informe listo');
    } catch (err) {
      this.toast.error(mensajeDeError(err, 'No se pudo generar el informe.'), 'Error');
    } finally {
      this.descargando.set(false);
    }
  }

  protected seleccionarPeriodo(id: string): void {
    this.periodoId.set(id);
  }

  protected nombreMes(mes: number): string {
    return this.meses[mes - 1] ?? String(mes);
  }

  /** Convierte porciones del backend en items del gráfico, con color estable. */
  private aSerie(porciones: readonly Porcion[] | undefined): ChartItem[] {
    return (porciones ?? []).map((p, i) => ({
      label: p.etiqueta,
      value: p.montoVendido,
      color: COLORES[i % COLORES.length],
      sublabel: `${p.cantidad} · ${p.pctMonto}%`,
    }));
  }
}
