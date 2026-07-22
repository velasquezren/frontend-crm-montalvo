import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Molécula Page Header — encabezado estándar de cada vista del workspace.
 * Título + subtítulo a la izquierda, acciones proyectadas a la derecha.
 * Ref: CRM_MANIFESTO.md §4.2.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-page-header',
  template: `
    <div class="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 class="text-2xl font-bold text-text-dark tracking-tight">{{ title() }}</h1>
        @if (subtitle()) {
          <p class="text-sm text-text-muted mt-1">{{ subtitle() }}</p>
        }
      </div>
      <div class="flex items-center gap-3">
        <ng-content />
      </div>
    </div>
  `,
})
export class PageHeaderComponent {
  readonly title = input.required<string>();
  readonly subtitle = input<string | undefined>(undefined);
}
