import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { IconComponent } from '../../shared/components/icon/icon.component';
import { PlanillaComisionesPage } from '../planilla-comisiones/planilla-comisiones.page';
import { ReportesPage } from '../reportes/reportes.page';
import { ResumenAnualPage } from '../planilla-comisiones/resumen-anual.page';

export type TabFinanzas = 'liquidacion' | 'analitica' | 'anual';

interface TabConfig {
  readonly id: TabFinanzas;
  readonly label: string;
  readonly icon: 'file-text' | 'bar-chart' | 'trending-up';
  readonly descripcion: string;
}

const TABS: readonly TabConfig[] = [
  {
    id: 'liquidacion',
    label: 'Liquidación Mensual',
    icon: 'file-text',
    descripcion: 'Planilla mensual de comisiones y objetivos por vendedora',
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
 * Agrupa Liquidación Mensual, Analítica Médica y Resumen Anual en una sola experiencia
 * fluida con pestañas sin recargas innecesarias.
 */
@Component({
  selector: 'app-finanzas',
  standalone: true,
  imports: [
    PageHeaderComponent,
    IconComponent,
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
  protected readonly tabActiva = signal<TabFinanzas>('liquidacion');

  constructor() {
    // Sincronización bidireccional limpia con queryParams (?tab=...)
    this.route.queryParams.subscribe(params => {
      const qTab = params['tab'] as string;
      if (qTab === 'analitica' || qTab === 'anual' || qTab === 'liquidacion') {
        this.tabActiva.set(qTab as TabFinanzas);
      }
    });
  }

  protected cambiarTab(nuevaTab: TabFinanzas): void {
    if (this.tabActiva() === nuevaTab) return;
    this.tabActiva.set(nuevaTab);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { tab: nuevaTab },
      queryParamsHandling: 'merge',
    });
  }

  protected tabInfoActual(): TabConfig {
    return this.tabs.find(t => t.id === this.tabActiva()) ?? this.tabs[0];
  }
}
