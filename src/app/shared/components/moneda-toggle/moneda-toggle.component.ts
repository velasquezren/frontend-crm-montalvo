import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { formatearNumero, MonedaService, MonedaVisualizacion } from '../../../core/moneda/moneda.service';

/**
 * Componente atómico de selector de moneda (Bs / $us).
 * Proporciona un switch segmentado ultra estético, sin emojis,
 * con respuesta inmediata (0ms) e integración con el CRM UI Kit.
 */
@Component({
  selector: 'app-moneda-toggle',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="inline-flex items-center p-0.5 rounded-xl bg-bg-light/90 border border-border/80 shadow-subtle select-none"
      [class.text-xs]="size() === 'sm'"
      [class.text-sm]="size() === 'md'"
      role="group"
      aria-label="Selector de moneda">
      <button
        type="button"
        (click)="cambiarMoneda('BOB')"
        class="px-2.5 py-1 rounded-lg font-bold transition-all duration-150 cursor-pointer flex items-center gap-1 leading-tight"
        [class.bg-primary]="monedaService.esBob()"
        [class.text-white]="monedaService.esBob()"
        [class.shadow-subtle]="monedaService.esBob()"
        [class.text-text-muted]="!monedaService.esBob()"
        [class.hover:text-text-dark]="!monedaService.esBob()"
        [class.hover:bg-white/60]="!monedaService.esBob()"
        title="Visualizar montos en Bolivianos (Bs)">
        <span>Bs</span>
        @if (mostrarDetalle()) {
          <span class="text-[10px] font-normal opacity-80">(BOB)</span>
        }
      </button>
      <button
        type="button"
        (click)="cambiarMoneda('USD')"
        class="px-2.5 py-1 rounded-lg font-bold transition-all duration-150 cursor-pointer flex items-center gap-1 leading-tight"
        [class.bg-primary]="monedaService.esUsd()"
        [class.text-white]="monedaService.esUsd()"
        [class.shadow-subtle]="monedaService.esUsd()"
        [class.text-text-muted]="!monedaService.esUsd()"
        [class.hover:text-text-dark]="!monedaService.esUsd()"
        [class.hover:bg-white/60]="!monedaService.esUsd()"
        [title]="tituloUsd()">
        <span>$us</span>
        @if (mostrarDetalle()) {
          <span class="text-[10px] font-normal opacity-80">(USD)</span>
        }
      </button>
    </div>
  `,
})
export class MonedaToggleComponent {
  protected readonly monedaService = inject(MonedaService);

  readonly size = input<'sm' | 'md'>('sm');
  readonly mostrarDetalle = input<boolean>(false);

  /**
   * Con qué se convierte, en el tooltip del botón de dólares.
   *
   * El toggle solo decía "Visualizar montos en Dólares", y con qué tasa era
   * invisible — justo el dato que hace falta para no confundir un monto
   * convertido al valor pactado de la clínica con uno convertido al oficial
   * del día, que en agosto de 2026 se diferencian en un 71 %.
   */
  protected readonly tituloUsd = computed(() => {
    const tc = formatearNumero(this.monedaService.tipoCambio());
    return this.monedaService.esTipoCambioFijo()
      ? `Visualizar montos en Dólares ($us) — convertido a Bs ${tc} (tipo de cambio fijo de la clínica)`
      : `Visualizar montos en Dólares ($us) — convertido a Bs ${tc}`;
  });

  protected cambiarMoneda(moneda: MonedaVisualizacion): void {
    this.monedaService.setMoneda(moneda);
  }
}
