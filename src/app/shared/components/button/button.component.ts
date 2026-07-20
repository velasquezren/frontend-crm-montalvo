import { Component, computed, input, output } from '@angular/core';

import { IconComponent, IconName } from '../icon/icon.component';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost';
export type ButtonSize = 'sm' | 'md';

/**
 * Átomo Button — CRM_MANIFESTO.md §3.2: siempre píldora (rounded-full).
 * Reemplaza los <button> estilizados a mano que existían en login/layout.
 */
@Component({
  selector: 'app-button',
  imports: [IconComponent],
  template: `
    <button
      [type]="type()"
      [disabled]="disabled() || loading()"
      [class]="classes()"
      (click)="clicked.emit($event)">
      @if (loading()) {
        <app-icon name="loader" [size]="iconSize()" />
      } @else if (icon(); as iconName) {
        <app-icon [name]="iconName" [size]="iconSize()" />
      }
      <ng-content />
    </button>
  `,
})
export class ButtonComponent {
  readonly variant = input<ButtonVariant>('primary');
  readonly size = input<ButtonSize>('md');
  readonly type = input<'button' | 'submit'>('button');
  readonly disabled = input(false);
  readonly loading = input(false);
  readonly icon = input<IconName | undefined>(undefined);
  readonly fullWidth = input(false, { alias: 'fullWidth' });
  /** true → botón circular solo-ícono (ej. enviar mensaje en el chat) */
  readonly circle = input(false);

  readonly clicked = output<MouseEvent>();

  protected readonly iconSize = computed(() => (this.size() === 'sm' ? 14 : 16));

  protected readonly classes = computed(() => {
    const base =
      'inline-flex items-center justify-center gap-2 rounded-full font-semibold ' +
      'transition-all duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed';

    const sizes: Record<ButtonSize, string> = this.circle()
      ? { sm: 'w-9 h-9 p-0', md: 'w-11 h-11 p-0' }
      : { sm: 'px-4 py-2 text-xs', md: 'px-5 py-2.5 text-sm' };

    const variants: Record<ButtonVariant, string> = {
      primary: 'bg-primary text-white shadow-subtle hover:opacity-90',
      secondary:
        'bg-white text-primary border border-border hover:bg-bg-light hover:border-primary/30',
      ghost: 'bg-transparent text-text-muted hover:text-primary hover:bg-bg-light',
    };

    const width = this.fullWidth() ? 'w-full' : '';

    return [base, sizes[this.size()], variants[this.variant()], width].join(' ');
  });
}
