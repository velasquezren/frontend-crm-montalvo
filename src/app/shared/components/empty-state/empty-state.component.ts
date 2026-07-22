import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { IconComponent, IconName } from '../icon/icon.component';

/**
 * Átomo Empty State — usado cuando una lista/sección aún no tiene datos.
 * Ref: CRM_MANIFESTO.md §4.1.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-empty-state',
  imports: [IconComponent],
  template: `
    <div class="flex flex-col items-center justify-center text-center py-12 px-6">
      <div class="w-14 h-14 rounded-2xl bg-neutral-bg flex items-center justify-center mb-4">
        <app-icon [name]="icon()" [size]="24" class="text-text-muted" />
      </div>
      <h3 class="text-base font-semibold text-text-dark">{{ title() }}</h3>
      @if (description()) {
        <p class="text-sm text-text-muted mt-1 max-w-sm">{{ description() }}</p>
      }
      <div class="mt-5">
        <ng-content />
      </div>
    </div>
  `,
})
export class EmptyStateComponent {
  readonly icon = input<IconName>('inbox');
  readonly title = input.required<string>();
  readonly description = input<string | undefined>(undefined);
}
