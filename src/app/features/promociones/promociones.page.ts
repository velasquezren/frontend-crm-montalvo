import { OverlayRef } from '@angular/cdk/overlay';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, TemplateRef, viewChild, ViewContainerRef } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { map } from 'rxjs';

import { AuthService } from '../../core/auth/auth.service';
import { ButtonComponent } from '../../shared/components/button/button.component';
import { DialogService } from '../../shared/components/dialog/dialog.service';
import { IconComponent, IconName } from '../../shared/components/icon/icon.component';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { AnunciosMetaComponent } from './components/anuncios-meta/anuncios-meta.component';
import { NuevaPromocionComponent } from './components/nueva-promocion/nueva-promocion.component';
import { PromocionesListaComponent } from './components/promociones-lista/promociones-lista.component';
import { PromocionDetalle } from './promocion.model';

export type TabPromociones = 'promociones' | 'anuncios';

interface TabConfig {
  readonly id: TabPromociones;
  readonly label: string;
  readonly icon: IconName;
  /** «Anuncios de Meta» es trabajo comercial: el backend lo exige desde AGENTE. */
  readonly comercial: boolean;
}

export const TABS_PROMOCIONES: readonly TabConfig[] = [
  { id: 'promociones', label: 'Promociones', icon: 'percent', comercial: false },
  { id: 'anuncios', label: 'Anuncios de Meta', icon: 'external-link', comercial: true },
];

export function tabPromocionesDe(valor: string | null | undefined): TabPromociones {
  return TABS_PROMOCIONES.find(t => t.id === valor)?.id ?? 'promociones';
}

/**
 * Promociones de la clínica: la agente las redacta con sus banners y precios,
 * un administrador las publica y entonces las ven la landing y WhatsApp
 * mientras estén vigentes. «Anuncios de Meta» enlaza los anuncios que trajeron
 * pacientes con su promoción, para que el CRM sepa de dónde vino cada una.
 *
 * Mismo patrón que Campañas: pestaña en la URL (`?tab=`), cada pestaña se
 * monta al visitarla y se queda montada, y `?id=` abre la ficha.
 */
@Component({
  selector: 'app-promociones-page',
  imports: [AnunciosMetaComponent, ButtonComponent, IconComponent, NuevaPromocionComponent, PageHeaderComponent, PromocionesListaComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './promociones.page.html',
})
export class PromocionesPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly dialog = inject(DialogService);
  private readonly vcr = inject(ViewContainerRef);
  private readonly nuevaTpl = viewChild.required<TemplateRef<unknown>>('nuevaTpl');
  private cajon?: OverlayRef;

  /** Redactar y ver los anuncios: desde AGENTE. Recepción las consulta. */
  protected readonly puedeRedactar = inject(AuthService).puedeGestionComercial;
  protected readonly tabs = TABS_PROMOCIONES;

  private readonly tabEnRuta = toSignal(this.route.queryParamMap.pipe(map(p => p.get('tab'))), {
    initialValue: this.route.snapshot.queryParamMap.get('tab'),
  });
  private readonly tabInicial = this.permitida(tabPromocionesDe(this.tabEnRuta()));
  protected readonly tabActiva = signal<TabPromociones>(this.tabInicial);
  private readonly visitadas = signal<ReadonlySet<TabPromociones>>(new Set([this.tabInicial]));

  constructor() {
    effect(() => this.mostrar(this.permitida(tabPromocionesDe(this.tabEnRuta()))));
  }

  protected readonly tabsVisibles = computed(() => this.tabs.filter(t => !t.comercial || this.puedeRedactar()));

  protected estaMontada(tab: TabPromociones): boolean {
    return this.visitadas().has(tab);
  }

  protected cambiarTab(tab: TabPromociones): void {
    if (this.tabActiva() === tab) return;
    this.mostrar(tab);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { tab: tab === 'promociones' ? null : tab },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  protected abrirNueva(): void {
    this.cajon?.dispose();
    this.cajon = this.dialog.abrirCajon(this.nuevaTpl(), this.vcr, { onClose: () => (this.cajon = undefined) });
  }

  protected cerrarNueva(): void {
    this.cajon?.dispose();
    this.cajon = undefined;
  }

  /** Recién creada: a «Promociones», con su ficha abierta para subir los banners. */
  protected alCrear(p: PromocionDetalle): void {
    this.cerrarNueva();
    this.mostrar('promociones');
    void this.router.navigate([], { relativeTo: this.route, queryParams: { tab: null, id: p.id }, queryParamsHandling: 'merge' });
  }

  private permitida(tab: TabPromociones): TabPromociones {
    return this.tabs.find(t => t.id === tab)?.comercial && !this.puedeRedactar() ? 'promociones' : tab;
  }

  private mostrar(tab: TabPromociones): void {
    this.tabActiva.set(tab);
    this.visitadas.update(vistas => (vistas.has(tab) ? vistas : new Set(vistas).add(tab)));
  }
}
