import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export type CardPadding = 'sm' | 'md' | 'lg';

/**
 * Átomo Card — CRM_MANIFESTO.md §3.2: rounded-2xl (16px) + shadow-subtle.
 *
 * La superficie llena su etiqueta (`block` + `h-full`): en una fila de la
 * rejilla la etiqueta se estira a la más alta, y sin esto cada tarjeta
 * terminaba a su altura y la fila quedaba escalonada (Dashboard, 16/11/2026).
 * Con alto automático, `h-full` no cambia nada.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-card',
  host: { class: 'block' },
  template: `
    <div [class]="classes()">
      <ng-content />
    </div>
  `,
})
export class CardComponent {
  readonly padding = input<CardPadding>('md');
  readonly hoverable = input(false);

  protected readonly classes = computed(() => {
    const paddings: Record<CardPadding, string> = {
      sm: 'p-4',
      md: 'p-6',
      lg: 'p-10',
    };

    const hover = this.hoverable()
      ? 'transition-shadow duration-200 hover:shadow-lifted'
      : '';

    return ['h-full bg-white rounded-2xl shadow-subtle', paddings[this.padding()], hover].join(' ');
  });
}
