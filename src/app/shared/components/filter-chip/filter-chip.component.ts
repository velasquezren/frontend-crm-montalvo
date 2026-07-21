import { Component, computed, input, output } from '@angular/core';

/**
 * Molécula Filter Chip — píldora de filtro con estado activo.
 * Usada en listados (clientes por categoría, leads por origen, etc.).
 * Ref: CRM_MANIFESTO.md §3.2 (píldoras), §4.2.
 */
@Component({
  selector: 'app-filter-chip',
  template: `
    <button
      type="button"
      [class]="classes()"
      [attr.aria-pressed]="active()"
      (click)="clicked.emit()">
      <ng-content />
      @if (count() !== undefined) {
        <span [class]="countClasses()">{{ count() }}</span>
      }
    </button>
  `,
})
export class FilterChipComponent {
  readonly active = input(false);
  readonly count = input<number | undefined>(undefined);
  readonly size = input<'sm' | 'md'>('md');

  readonly clicked = output<void>();

  protected readonly classes = computed(() => {
    const isSm = this.size() === 'sm';
    const padding = isSm ? 'px-2.5 py-1 text-xs gap-1.5' : 'px-4 py-2 text-xs gap-2';
    const base =
      `inline-flex items-center ${padding} rounded-full font-medium ` +
      'transition-all duration-200 cursor-pointer border shrink-0';

    return this.active()
      ? `${base} bg-primary text-white border-primary shadow-subtle`
      : `${base} bg-white text-text-muted border-border hover:text-primary hover:border-primary/30 hover:bg-bg-light`;
  });

  protected readonly countClasses = computed(() =>
    this.active()
      ? 'rounded-full bg-white/20 px-1.5 py-0.5 text-[10px] leading-none'
      : 'rounded-full bg-neutral-bg px-1.5 py-0.5 text-[10px] leading-none',
  );
}
