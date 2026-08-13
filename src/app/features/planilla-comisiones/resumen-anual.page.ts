import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
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
import { FilterChipComponent } from '../../shared/components/filter-chip/filter-chip.component';
import { BarChartComponent, ChartItem } from '../../shared/components/charts/bar-chart.component';
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
    PageHeaderComponent,
    TableComponent,
    BadgeComponent,
    IconComponent,
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
  private readonly planillaService = inject(PlanillaComisionesService);

  protected readonly mesesCortos = MESES_CORTOS;
  protected readonly anio = signal(new Date().getFullYear());
  protected readonly busqueda = signal('');
  protected readonly filtroBono = signal<FiltroBonoResumen>('TODAS');
  protected readonly expandida = signal<string | null>(null);
  protected readonly mostrarGrafico = signal(true);

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

  /** Total bonos trimestrales en BOB */
  protected readonly totalBonosAnualBob = computed(() =>
    this.resumen.value().filas.reduce((suma, f) => {
      const bonoBobFila = f.trimestres.reduce((s, t) => s + t.bonoBob, 0);
      return suma + bonoBobFila;
    }, 0),
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

  protected cambiarAnio(valor: string): void {
    const n = Number(valor);
    if (Number.isFinite(n)) {
      this.anio.set(n);
      this.expandida.set(null);
    }
  }

  protected alternarDetalle(vendedoraId: string): void {
    this.expandida.update(actual => (actual === vendedoraId ? null : vendedoraId));
  }

  protected toggleGrafico(): void {
    this.mostrarGrafico.update(v => !v);
  }

  protected obtenerIniciales(nombre: string): string {
    if (!nombre) return 'VN';
    const partes = nombre.trim().split(/\s+/);
    if (partes.length >= 2) {
      return (partes[0][0] + partes[1][0]).toUpperCase();
    }
    return nombre.substring(0, 2).toUpperCase();
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
