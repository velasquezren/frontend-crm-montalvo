import { Component, computed, input } from '@angular/core';

import { IconComponent, IconName } from '../icon/icon.component';

export type BadgeVariant = 'success' | 'info' | 'neutral' | 'critical';

/**
 * Átomo Badge — pares bg/texto derivados de la paleta (styles.css §Tokens de Estado).
 * "critical" usa negro (text-critical) en vez de rojo: ver CRM_MANIFESTO.md §3.4.
 */
@Component({
  selector: 'app-badge',
  imports: [IconComponent],
  template: `
    <span [class]="classes()">
      @if (icon(); as iconName) {
        <app-icon [name]="iconName" [size]="12" [strokeWidth]="2.5" />
      }
      <ng-content />
    </span>
  `,
})
export class BadgeComponent {
  readonly variant = input<BadgeVariant>('neutral');
  readonly icon = input<IconName | undefined>(undefined);

  protected readonly classes = computed(() => {
    const base =
      'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium leading-none';

    const variants: Record<BadgeVariant, string> = {
      success: 'bg-success-bg text-success',
      info: 'bg-info-bg text-info',
      neutral: 'bg-neutral-bg text-neutral',
      critical: 'bg-critical-bg text-critical',
    };

    return [base, variants[this.variant()]].join(' ');
  });
}
