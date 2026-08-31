import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';

import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { IconComponent } from '../../shared/components/icon/icon.component';
import { DesempenoAgentesComponent } from './components/desempeno-agentes/desempeno-agentes.component';
import { TipoCambioAdminComponent } from './components/tipo-cambio/tipo-cambio-admin.component';
import { PlanillaComisionesPage } from '../planilla-comisiones/planilla-comisiones.page';
import { AnaliticaPage } from '../analitica/analitica.page';
import { ResumenAnualPage } from '../planilla-comisiones/resumen-anual.page';

export type TabFinanzas = 'liquidacion' | 'agentes' | 'analitica' | 'anual' | 'tipo-cambio';

interface TabConfig {
  readonly id: TabFinanzas;
  readonly label: string;
  readonly icon: 'file-text' | 'users' | 'bar-chart' | 'trending-up' | 'dollar-sign';
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
  {
    id: 'tipo-cambio',
    label: 'Tipo de Cambio',
    icon: 'dollar-sign',
    descripcion: 'Serie histórica del TC oficial USD→BOB, con corrección manual',
  },
];

/**
 * Finanzas & Comisiones — Módulo unificado para administración y contabilidad médica.
 * Agrupa Liquidación Mensual, Desempeño de Agentes, Analítica Médica y Resumen Anual con:
 * - 0ms de cambio de pestaña (retención instantánea de estado en memoria)
 * - Sincronización 100% reactiva en URL (?tab=...)
 * - Cero parpadeos entre navegaciones y renderizado ultra-fluido
 */
@Component({
  selector: 'app-finanzas',
  imports: [
    PageHeaderComponent,
    IconComponent,
    DesempenoAgentesComponent,
    TipoCambioAdminComponent,
    PlanillaComisionesPage,
    AnaliticaPage,
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

  private readonly tabInicial = this.resolverTabInicial();

  /** Pestaña activa con cambio síncrono instantáneo a 0ms */
  protected readonly tabActiva = signal<TabFinanzas>(this.tabInicial);

  /** Pestañas montadas en memoria */
  private readonly visitadas = signal<ReadonlySet<TabFinanzas>>(new Set([this.tabInicial]));

  constructor() {
    // Si el usuario usa las flechas Atrás/Adelante del navegador, sincroniza
    effect(() => {
      const q = this.queryParams()?.['tab'] as string;
      if (this.esTabValida(q) && this.tabActiva() !== q) {
        this.tabActiva.set(q);
        this.visitadas.update(vistas => new Set(vistas).add(q));
      }
    });
  }

  private resolverTabInicial(): TabFinanzas {
    const q = this.route.snapshot.queryParams['tab'] as string;
    return this.esTabValida(q) ? q : 'liquidacion';
  }

  /** Contra `TABS`, no contra una lista aparte — dar de alta una pestaña
   *  nueva solo en `TABS` y no acá era la forma obvia de que esto mintiera.
   *  Cinco elementos: un `.some()` no necesita el `Set` que sí valdría la
   *  pena con una lista larga. */
  private esTabValida(q: string | undefined): q is TabFinanzas {
    return !!q && TABS.some(t => t.id === q);
  }

  /**
   * `cambiarTab()` y el efecto de atrás/adelante son los dos únicos que
   * tocan `tabActiva`, y los dos agregan a `visitadas` en el mismo gesto
   * (igual que `tabInicial` ya nace dentro del `Set` inicial) — la pestaña
   * activa SIEMPRE está en `visitadas`, así que no hace falta reconstruir un
   * `Set` nuevo en cada lectura solo para agregarla "por si acaso".
   */
  protected estaMontada(tab: TabFinanzas): boolean {
    return this.visitadas().has(tab);
  }

  protected readonly tabInfoActual = computed<TabConfig>(() => {
    const activa = this.tabActiva();
    return this.tabs.find(t => t.id === activa) ?? this.tabs[0];
  });

  /** Precarga predictiva al pasar el cursor (hover prefetching) */
  protected precargarTab(tab: TabFinanzas): void {
    if (!this.visitadas().has(tab)) {
      this.visitadas.update(vistas => new Set(vistas).add(tab));
    }
  }

  protected cambiarTab(nuevaTab: TabFinanzas): void {
    if (this.tabActiva() === nuevaTab) return;
    // Cambio síncrono instantáneo
    this.tabActiva.set(nuevaTab);
    this.visitadas.update(vistas => new Set(vistas).add(nuevaTab));

    // Sincronización silenciosa en la URL
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { tab: nuevaTab },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }
}
