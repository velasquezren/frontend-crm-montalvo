import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { MonedaService, MonedaVisualizacion } from '../../../core/moneda/moneda.service';

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
        title="Visualizar montos en Dólares ($us)">
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

  protected cambiarMoneda(moneda: MonedaVisualizacion): void {
    this.monedaService.setMoneda(moneda);
  }
}
