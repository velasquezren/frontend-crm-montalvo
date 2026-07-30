import { DatePipe, DecimalPipe } from '@angular/common';
import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';

import { AuthService } from '../../core/auth/auth.service';
import { paginaVacia, RespuestaPaginada } from '../../core/api/pagination.model';
import { AvatarComponent } from '../../shared/components/avatar/avatar.component';
import { BadgeComponent } from '../../shared/components/badge/badge.component';
import { ButtonComponent } from '../../shared/components/button/button.component';
import { CardComponent } from '../../shared/components/card/card.component';
import { BarChartComponent, ChartItem } from '../../shared/components/charts/bar-chart.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { IconComponent, IconName } from '../../shared/components/icon/icon.component';
import { LoadingSkeletonComponent } from '../../shared/components/loading-skeleton/loading-skeleton.component';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { TableComponent } from '../../shared/components/table/table.component';
import { formatearBs, MonedaPipe } from '../../shared/pipes/moneda.pipe';
import { PeriodoComision, ReporteConsolidado } from '../planilla-comisiones/planilla.model';
import { KpiResumen } from '../dashboard/kpis.model';
import { ReportesService } from './reportes.service';

export type RangoFiltro = 'ULTIMOS_MESES' | 'TODOS';

const ORIGEN_LABEL: Record<string, string> = {
  WHATSAPP_DIRECTO: 'WhatsApp Directo',
  FACEBOOK_LEAD_AD: 'Facebook Lead Ads',
  FACEBOOK_COMENTARIO: 'Facebook Comentarios',
  FACEBOOK_MENSAJE: 'Facebook Mensajes',
  INSTAGRAM_LEAD_AD: 'Instagram Lead Ads',
  INSTAGRAM_COMENTARIO: 'Instagram Comentarios',
  INSTAGRAM_MENSAJE: 'Instagram Mensajes',
  PRESENCIAL: 'Ventanilla Presencial',
  IMPORTACION: 'Importación Excel',
};

const ORIGEN_COLOR: Record<string, string> = {
  WHATSAPP_DIRECTO: '#006156',
  FACEBOOK_LEAD_AD: '#39ADA3',
  FACEBOOK_COMENTARIO: '#60A5FA',
  FACEBOOK_MENSAJE: '#93C5FD',
  INSTAGRAM_LEAD_AD: '#7C3AED',
  INSTAGRAM_COMENTARIO: '#A78BFA',
  INSTAGRAM_MENSAJE: '#C4B5FD',
  PRESENCIAL: '#D97706',
  IMPORTACION: '#64748B',
};

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

/**
 * ReportesPage — Dashboard de Analítica Visual y Reportes Generales.
 * Presenta gráficos de barras, métricas consolidadas, desgloses por mes y vendedora.
 */
@Component({
  selector: 'app-reportes',
  imports: [
    DecimalPipe,
    MonedaPipe,
    PageHeaderComponent,
    CardComponent,
    BadgeComponent,
    ButtonComponent,
    IconComponent,
    TableComponent,
    LoadingSkeletonComponent,
    EmptyStateComponent,
    BarChartComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './reportes.page.html',
  styleUrl: './reportes.page.css',
})
export class ReportesPage {
  private readonly reportesService = inject(ReportesService);
  private readonly authService = inject(AuthService);

  protected readonly esAdmin = this.authService.isAdmin;
  protected readonly periodoId = signal<string | null>(null);
  protected readonly modoGrafico = signal<'BAR' | 'COLUMN'>('COLUMN');

  /** Consumo reactivo de endpoints via httpResource */
  protected readonly kpiData = httpResource<KpiResumen>(
    () => this.reportesService.kpisRequest(),
  );

  protected readonly periodosData = httpResource<RespuestaPaginada<PeriodoComision>>(
    () => this.reportesService.periodosRequest(),
    { defaultValue: paginaVacia<PeriodoComision>() },
  );

  protected readonly consolidadoEstado = signal<ReporteConsolidado | null>(null);
  protected readonly cargandoConsolidado = signal(false);

  constructor() {
    // Al seleccionar o cargar periodos, refrescar consolidado si existe un periodoId
    effect(() => {
      const list = this.periodosData.value().datos;
      if (list.length > 0 && !this.periodoId()) {
        this.periodoId.set(list[0].id);
      }
    });

    effect(() => {
      const id = this.periodoId();
      if (!id) return;
      void this.cargarConsolidado(id);
    });
  }

  /* ── Métricas y Series de Gráficos Computed ─────────────────────── */

  protected readonly kpisMetricas = computed(() => {
    const res = this.kpiData.value();
    if (!res) return [];

    const totalVenta = res.ventas.total;
    const cantVenta = res.ventas.cantidad;
    const totalLeads = res.leadsPorOrigen.reduce((s, l) => s + l.cantidad, 0);
    const totalConvertidos = res.leadsPorOrigen.reduce((s, l) => s + l.convertidos, 0);
    const tasaGlobal = totalLeads > 0 ? Math.round((totalConvertidos / totalLeads) * 100) : 0;
    const ticketPromedio = cantVenta > 0 ? Math.round(totalVenta / cantVenta) : 0;

    return [
      {
        title: 'Ingresos Totales (Ventas)',
        val: formatearBs(totalVenta),
        sub: `${cantVentasTexto(cantVenta)} cerradas`,
        icon: 'shopping-bag' as IconName,
        badge: 'General',
        variant: 'success' as const,
      },
      {
        title: 'Ticket Promedio por Venta',
        val: formatearBs(ticketPromedio),
        sub: 'Promedio registrado',
        icon: 'bar-chart' as IconName,
        badge: 'Promedio',
        variant: 'info' as const,
      },
      {
        title: 'Leads Captados',
        val: String(totalLeads),
        sub: `${totalConvertidos} ventas convertidas`,
        icon: 'user-plus' as IconName,
        badge: `${tasaGlobal}% efectividad`,
        variant: 'info' as const,
      },
      {
        title: 'Comisiones Acumuladas',
        val: formatearBs(res.comisiones.pendiente + res.comisiones.pagada),
        sub: `Pagadas: ${formatearBs(res.comisiones.pagada)}`,
        icon: 'wallet' as IconName,
        badge: 'Liquidación',
        variant: 'neutral' as const,
      },
    ];
  });

  /** Gráfico de Barras: Comparativa Mensual de Planillas Cargadas */
  protected readonly periodosChartData = computed<ChartItem[]>(() => {
    const periodos = this.periodosData.value().datos;
    if (!periodos.length) return [];

    return [...periodos]
      .reverse()
      .map(p => ({
        label: `${this.nombreMes(p.mes)} ${p.anio}`,
        value: p.filasValidas * 100, // Representación de rendimiento o filas comisionables
        sublabel: `${p.filasValidas} comisionables`,
        color: p.estado === 'CALCULADO' ? '#006156' : '#39ADA3',
      }));
  });

  /** Gráfico de Barras: Captación de Leads por Canal */
  protected readonly canalesChartData = computed<ChartItem[]>(() => {
    const res = this.kpiData.value();
    if (!res) return [];

    return res.leadsPorOrigen.map(l => ({
      label: ORIGEN_LABEL[l.origen] || l.origen,
      value: l.cantidad,
      sublabel: `${l.tasaConversion}% conv.`,
      color: ORIGEN_COLOR[l.origen] || '#006156',
    }));
  });

  /** Gráfico de Barras: Clientes por Categoría */
  protected readonly categoriasChartData = computed<ChartItem[]>(() => {
    const res = this.kpiData.value();
    if (!res) return [];

    const colMap: Record<string, string> = {
      GOLD: '#D97706',
      SILVER: '#64748B',
      BRONZE: '#B45309',
      PROSPECTO: '#006156',
    };

    return res.clientesPorCategoria.map(c => ({
      label: c.categoria,
      value: c.cantidad,
      color: colMap[c.categoria] || '#39ADA3',
    }));
  });

  /** Gráfico de Barras: Desglose por Vendedora (del periodo seleccionado) */
  protected readonly vendedorasVentasChartData = computed<ChartItem[]>(() => {
    const rep = this.consolidadoEstado();
    if (!rep || !rep.filas.length) return [];

    return rep.filas.map(f => ({
      label: f.nombre.split(' ')[0],
      value: f.montoVendido,
      sublabel: `${f.planesVendidos} planes`,
      color: '#006156',
    }));
  });

  /** Gráfico de Barras: Comisiones USD Ganadas por Vendedora */
  protected readonly vendedorasComisionesChartData = computed<ChartItem[]>(() => {
    const rep = this.consolidadoEstado();
    if (!rep || !rep.filas.length) return [];

    return rep.filas.map(f => ({
      label: f.nombre.split(' ')[0],
      value: f.totalUsd,
      sublabel: `Bs ${f.totalBob.toFixed(0)}`,
      color: '#39ADA3',
    }));
  });

  /* ── Métodos ────────────────────────────────────────────────────── */

  protected seleccionarPeriodo(id: string): void {
    this.periodoId.set(id);
  }

  protected alternarModoGrafico(): void {
    this.modoGrafico.update(m => (m === 'COLUMN' ? 'BAR' : 'COLUMN'));
  }

  protected nombreMes(mes: number): string {
    return MESES[mes - 1] ?? String(mes);
  }

  private async cargarConsolidado(id: string): Promise<void> {
    this.cargandoConsolidado.set(true);
    try {
      const data = await this.reportesService.obtenerConsolidadoPeriodo(id);
      this.consolidadoEstado.set(data);
    } catch {
      this.consolidadoEstado.set(null);
    } finally {
      this.cargandoConsolidado.set(false);
    }
  }
}

function cantVentasTexto(n: number): string {
  return `${n} venta${n === 1 ? '' : 's'}`;
}
