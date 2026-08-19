import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';

import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { IconComponent } from '../../shared/components/icon/icon.component';
import { DesempenoAgentesComponent } from './components/desempeno-agentes/desempeno-agentes.component';
import { PlanillaComisionesPage } from '../planilla-comisiones/planilla-comisiones.page';
import { ReportesPage } from '../reportes/reportes.page';
import { ResumenAnualPage } from '../planilla-comisiones/resumen-anual.page';

export type TabFinanzas = 'liquidacion' | 'agentes' | 'analitica' | 'anual';

interface TabConfig {
  readonly id: TabFinanzas;
  readonly label: string;
  readonly icon: 'file-text' | 'users' | 'bar-chart' | 'trending-up';
  readonly descripcion: string;
}

const TABS: readonly TabConfig[] = [
  {
    id: 'liquidacion',
    label: 'Planilla & Liquidación',
    icon: 'file-text',
    descripcion: 'Planilla mensual de comisiones y matriz contable por periodo',
  },
  {
    id: 'agentes',
    label: 'Desempeño de Agentes',
    icon: 'users',
    descripcion: 'Ficha 360° individual, progreso de metas de maternidad y tramos de cirugía',
  },
  {
    id: 'analitica',
    label: 'Analítica Médica',
    icon: 'bar-chart',
    descripcion: 'Distribución de servicios, procedimientos y canales de venta',
  },
  {
    id: 'anual',
    label: 'Resumen Anual',
    icon: 'trending-up',
    descripcion: 'Consolidado histórico de 12 meses y bonos trimestrales',
  },
];

/**
 * Finanzas & Comisiones — Módulo unificado para administración y contabilidad médica.
 * Agrupa Liquidación Mensual, Desempeño de Agentes, Analítica Médica y Resumen Anual con:
 * - 0ms de cambio de pestaña (retención instantánea de estado en memoria)
 * - Sincronización 100% reactiva en URL (?tab=...)
 * - Diseño segmentado de alta fidelidad sin parpadeos
 */
@Component({
  selector: 'app-finanzas',
  standalone: true,
  imports: [
    PageHeaderComponent,
    IconComponent,
    DesempenoAgentesComponent,
    PlanillaComisionesPage,
    ReportesPage,
    ResumenAnualPage,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './finanzas.page.html',
  styleUrl: './finanzas.page.css',
})
export class FinanzasPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly tabs = TABS;

  private readonly queryParams = toSignal(this.route.queryParams);

  /** Pestaña activa derivada reactivamente de la URL */
  protected readonly tabActiva = computed<TabFinanzas>(() => {
    const q = this.queryParams()?.['tab'] as string;
    if (q === 'agentes' || q === 'analitica' || q === 'anual' || q === 'liquidacion') {
      return q;
    }
    return 'liquidacion';
  });

  protected readonly tabInfoActual = computed<TabConfig>(() => {
    const activa = this.tabActiva();
    return this.tabs.find(t => t.id === activa) ?? this.tabs[0];
  });

  protected cambiarTab(nuevaTab: TabFinanzas): void {
    if (this.tabActiva() === nuevaTab) return;
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { tab: nuevaTab },
      queryParamsHandling: 'merge',
    });
  }
}
