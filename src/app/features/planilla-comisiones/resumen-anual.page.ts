import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { httpResource } from '@angular/common/http';
import { DecimalPipe } from '@angular/common';

import { ErrorCargaComponent } from '../../shared/components/error-carga/error-carga.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { InfoHintComponent } from '../../shared/components/info-hint/info-hint.component';
import { LoadingSkeletonComponent } from '../../shared/components/loading-skeleton/loading-skeleton.component';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { TableComponent } from '../../shared/components/table/table.component';
import { BadgeComponent } from '../../shared/components/badge/badge.component';
import { IconComponent } from '../../shared/components/icon/icon.component';
import { KpiCardComponent } from '../../shared/components/kpi-card/kpi-card.component';
import { FilterChipComponent } from '../../shared/components/filter-chip/filter-chip.component';
import { BarChartComponent, ChartItem } from '../../shared/components/charts/bar-chart.component';
import { MonedaToggleComponent } from '../../shared/components/moneda-toggle/moneda-toggle.component';
import { MonedaPipe } from '../../shared/pipes/moneda.pipe';
import { FilaAnual, MESES_CORTOS, ResumenAnual, TrimestreVendedora } from './planilla.model';
import { PlanillaComisionesService } from './planilla-comisiones.service';

/** Cuántos años atrás se puede mirar desde el selector. */
const ANIOS_HACIA_ATRAS = 4;

export type FiltroBonoResumen = 'TODAS' | 'CON_BONO' | 'SIN_BONO';

/**
 * Resumen anual de comisiones — la única vista que cruza periodos.
 *
 * Muestra la matriz de doce meses de facturación por vendedora y la liquidación
 * de los cuatro trimestres con su bono correspondiente.
 */
@Component({
  selector: 'app-resumen-anual',
  standalone: true,
  imports: [
    DecimalPipe,
    MonedaPipe,
    MonedaToggleComponent,
    PageHeaderComponent,
    TableComponent,
    BadgeComponent,
    IconComponent,
    KpiCardComponent,
    FilterChipComponent,
    BarChartComponent,
    InfoHintComponent,
    LoadingSkeletonComponent,
    EmptyStateComponent,
    ErrorCargaComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './resumen-anual.page.html',
  styleUrl: './resumen-anual.page.css',
})
export class ResumenAnualPage {
  readonly embedded = input(false);

  private readonly planillaService = inject(PlanillaComisionesService);

  protected readonly mesesCortos = MESES_CORTOS;
  protected readonly anio = signal(new Date().getFullYear());
  protected readonly busqueda = signal('');
  protected readonly filtroBono = signal<FiltroBonoResumen>('TODAS');
  protected readonly mostrarGrafico = signal(true);

  /** IDs de vendedoras cuyos detalles trimestrales están desplegados. */
  protected readonly vendedorasExpandidas = signal<Set<string>>(new Set());

  /** Años ofrecidos en el selector, del actual hacia atrás. */
  protected readonly anios = computed(() => {
    const actual = new Date().getFullYear();
    return Array.from({ length: ANIOS_HACIA_ATRAS + 1 }, (_, i) => actual - i);
  });

  protected readonly resumen = httpResource<ResumenAnual>(
    () => this.planillaService.resumenAnualRequest(this.anio()),
    { defaultValue: { anio: new Date().getFullYear(), filas: [], totalesPorMes: [] } },
  );

  /** Total vendido del año en USD */
  protected readonly totalAnual = computed(() =>
    this.resumen.value().filas.reduce((suma, f) => suma + f.totalVendido, 0),
  );

  /** Total comisiones ganadas en USD */
  protected readonly totalComisionAnualUsd = computed(() =>
    this.resumen.value().filas.reduce((suma, f) => suma + f.totalComisionUsd, 0),
  );

  /** Total bonos trimestrales en USD */
  protected readonly totalBonosAnualUsd = computed(() =>
    this.resumen.value().filas.reduce((suma, f) => suma + f.totalBonoTrimestralUsd, 0),
  );

  /** Cuántos meses del año tienen datos. */
  protected readonly mesesConDatos = computed(
    () => this.resumen.value().totalesPorMes.filter(v => v > 0).length,
  );

  /** Promedio mensual general facturado en el equipo. */
  protected readonly promedioMensual = computed(() => {
    const meses = this.mesesConDatos();
    return meses > 0 ? this.totalAnual() / meses : 0;
  });

  /** Vendedoras que alcanzaron al menos un bono trimestral. */
  protected readonly vendedorasQueCobranBono = computed(() =>
    this.resumen.value().filas.filter(f => f.totalBonoTrimestralUsd > 0).length,
  );

  /** Transforma la facturación mensual para el gráfico de barras. */
  protected readonly datosGraficoMensual = computed<ChartItem[]>(() => {
    const totales = this.resumen.value().totalesPorMes;
    return MESES_CORTOS.map((mesNombre, idx) => {
      const valor = totales[idx] ?? 0;
      return {
        label: mesNombre,
        value: valor,
        sublabel: valor > 0 ? undefined : 'sin datos',
      };
    });
  });

  /** Filas filtradas por búsqueda y filtro de bonos. */
  protected readonly filasFiltradas = computed(() => {
    const query = this.busqueda().trim().toLowerCase();
    const filtro = this.filtroBono();
    let lista = this.resumen.value().filas;

    if (query) {
      lista = lista.filter(
        f =>
          f.nombre.toLowerCase().includes(query) ||
          f.area.toLowerCase().includes(query) ||
          f.tipo.toLowerCase().includes(query) ||
          (f.codigo && f.codigo.toLowerCase().includes(query)),
      );
    }

    if (filtro === 'CON_BONO') {
      lista = lista.filter(f => f.totalBonoTrimestralUsd > 0);
    } else if (filtro === 'SIN_BONO') {
      lista = lista.filter(f => f.totalBonoTrimestralUsd === 0);
    }

    return lista;
  });

  /**
   * Totales de lo que se está VIENDO, no del año entero.
   *
   * El cuerpo de la tabla pinta `filasFiltradas()`, así que un pie con los
   * totales completos no cuadra con las filas de encima: al filtrar por "Con
   * Bono" se veían dos vendedoras y un total de cuatro. En una tabla de
   * remuneración eso se lee como un error de cálculo, no como un filtro.
   */
  protected readonly totalesPorMesFiltrados = computed(() => {
    const meses = Array.from({ length: 12 }, () => 0);
    for (const fila of this.filasFiltradas()) {
      fila.meses.forEach((m, i) => (meses[i] += m.montoVendido));
    }
    return meses;
  });

  protected readonly totalFiltrado = computed(() =>
    this.filasFiltradas().reduce((suma, f) => suma + f.totalVendido, 0),
  );

  /** ¿Hay algún filtro activo? Sirve para avisarlo en el pie. */
  protected readonly hayFiltro = computed(
    () => this.busqueda().trim().length > 0 || this.filtroBono() !== 'TODAS',
  );

  protected cambiarAnio(valor: string): void {
    const n = Number(valor);
    if (Number.isFinite(n)) {
      this.anio.set(n);
      this.vendedorasExpandidas.set(new Set());
    }
  }

  protected esExpandida(vendedoraId: string): boolean {
    return this.vendedorasExpandidas().has(vendedoraId);
  }

  protected alternarDetalle(vendedoraId: string): void {
    this.vendedorasExpandidas.update(set => {
      const nuevo = new Set(set);
      if (nuevo.has(vendedoraId)) {
        nuevo.delete(vendedoraId);
      } else {
        nuevo.add(vendedoraId);
      }
      return nuevo;
    });
  }

  protected expandirTodas(): void {
    const todas = new Set(this.resumen.value().filas.map(f => f.vendedoraId));
    this.vendedorasExpandidas.set(todas);
  }

  protected colapsarTodas(): void {
    this.vendedorasExpandidas.set(new Set());
  }

  protected toggleGrafico(): void {
    this.mostrarGrafico.update(v => !v);
  }

  protected calcularPctMetaTrimestral(promedio: number, objetivoUsd: number): number {
    if (!objetivoUsd || objetivoUsd <= 0) return 0;
    const pct = Math.round((promedio / objetivoUsd) * 100);
    return Math.min(pct, 100);
  }

  protected leyendaTrimestre(t: TrimestreVendedora): string | null {
    if (t.mesesConDatos === 0) return 'sin datos';
    if (t.mesesConDatos < 3) return `parcial · ${t.mesesConDatos} de 3 meses`;
    return null;
  }

  protected esTrimestreCompleto(t: TrimestreVendedora): boolean {
    return t.mesesConDatos === 3;
  }

  protected idDeFila(_indice: number, fila: FilaAnual): string {
    return fila.vendedoraId;
  }
}
