import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { map } from 'rxjs';

import { IconComponent, IconName } from '../../shared/components/icon/icon.component';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { Campana } from './campana.model';
import { CampanaAudienciaComponent } from './components/campana-audiencia/campana-audiencia.component';
import { CampanasListaComponent } from './components/campanas-lista/campanas-lista.component';

export type TabCampanas = 'campanas' | 'audiencia';

interface TabConfig {
  readonly id: TabCampanas;
  readonly label: string;
  readonly icon: IconName;
}

/** «Campañas» primero: es lo que se vuelve a mirar; la audiencia es el paso previo a una nueva. */
export const TABS_CAMPANAS: readonly TabConfig[] = [
  { id: 'campanas', label: 'Campañas', icon: 'send' },
  { id: 'audiencia', label: 'Audiencia', icon: 'users' },
];

/** La pestaña que pide la URL; cualquier otro valor (o ninguno) es «Campañas». */
export function tabCampanasDe(valor: string | null | undefined): TabCampanas {
  return TABS_CAMPANAS.find(t => t.id === valor)?.id ?? 'campanas';
}

/**
 * Campañas de Marketing, en una sola página: a quién escribirle
 * («Audiencia») y qué se mandó y qué logró («Campañas»).
 *
 * Eran dos pantallas, Audiencias y Campañas, pero una audiencia no sirve para
 * otra cosa que lanzar una campaña: obligaba a ir y volver entre dos entradas
 * del menú para un solo trabajo. Mismo patrón que Finanzas:
 *
 * - La pestaña vive en la URL (`?tab=audiencia`): se comparte, se recarga y
 *   Atrás/Adelante la respetan. `/audiencias` redirige aquí.
 * - Cada pestaña se monta al visitarla y se queda montada: volver a la
 *   audiencia conserva los filtros elegidos (`.crm-pestana-panel-oculta`).
 * - Al crear una campaña se pasa a «Campañas» con su ficha abierta (`?id=`,
 *   que resuelve `CampanasListaComponent`).
 */
@Component({
  selector: 'app-campanas-page',
  imports: [CampanaAudienciaComponent, CampanasListaComponent, IconComponent, PageHeaderComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './campanas.page.html',
})
export class CampanasPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly tabs = TABS_CAMPANAS;

  private readonly tabEnRuta = toSignal(this.route.queryParamMap.pipe(map(p => p.get('tab'))), {
    initialValue: this.route.snapshot.queryParamMap.get('tab'),
  });

  private readonly tabInicial = tabCampanasDe(this.tabEnRuta());
  protected readonly tabActiva = signal<TabCampanas>(this.tabInicial);
  /** Las ya visitadas siguen montadas. La activa siempre está aquí. */
  private readonly visitadas = signal<ReadonlySet<TabCampanas>>(new Set([this.tabInicial]));

  constructor() {
    /* Atrás/Adelante, o un enlace a `?tab=` estando ya en la página. */
    effect(() => this.mostrar(tabCampanasDe(this.tabEnRuta())));
  }

  protected estaMontada(tab: TabCampanas): boolean {
    return this.visitadas().has(tab);
  }

  protected cambiarTab(tab: TabCampanas): void {
    if (this.tabActiva() === tab) return;
    this.mostrar(tab);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { tab: tab === 'campanas' ? null : tab },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  /** Recién creada: a «Campañas», con su ficha abierta. */
  protected alCrearCampana(campana: Campana): void {
    this.mostrar('campanas');
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { tab: null, id: campana.id },
      queryParamsHandling: 'merge',
    });
  }

  private mostrar(tab: TabCampanas): void {
    this.tabActiva.set(tab);
    this.visitadas.update(vistas => (vistas.has(tab) ? vistas : new Set(vistas).add(tab)));
  }
}
