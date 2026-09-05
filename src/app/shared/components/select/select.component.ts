import { ChangeDetectionStrategy, Component, computed, input, model } from '@angular/core';

import { IconComponent, IconName } from '../icon/icon.component';

/**
 * `md` es un campo de formulario, del alto de `<app-input>`; `sm` es un filtro
 * de barra, que convive con `<app-filter-chip>` y con botones `size="sm"`.
 * Antes había cinco alturas distintas para estos dos únicos usos.
 */
export type SelectSize = 'sm' | 'md';

let nextId = 0;

/**
 * Átomo Select — el desplegable del sistema (CRM_MANIFESTO.md §3.2).
 *
 * **Por qué existe.** Era el único control de formulario sin átomo, y se notaba:
 * 25 `<select>` nativos repartidos por diez vistas con **once combinaciones de
 * clases distintas** — cuatro sopas de utilidades escritas a mano y tres clases
 * CSS locales (`select-base`, `select-periodo`, `edit-select`) definidas en
 * archivos diferentes para hacer lo mismo. El filtro de Ventas no se parecía al
 * de Clientes, y ninguno de los dos al de la ficha del paciente.
 *
 * En un control interactivo eso pesa más que en una etiqueta: lo que divergía no
 * era solo el borde, era **el anillo de foco, el estado deshabilitado y la
 * flecha**. Un `<select>` nativo sin `appearance-none` dibuja la flecha del
 * sistema operativo, así que la misma pantalla mezclaba flechas de macOS con las
 * dibujadas a mano.
 *
 * **Las opciones se proyectan**, no se pasan como arreglo: las vistas las sacan
 * de sitios muy distintos —listas estáticas, `@for` sobre agentes, `@if` según
 * el rol— y un `input()` de opciones obligaría a aplanar todo eso en el `.ts`.
 * Proyectar deja el marcado tal cual estaba y hace la migración un cambio de
 * etiqueta, no una reescritura.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-select',
  imports: [IconComponent],
  template: `
    <div class="flex flex-col gap-1.5" [class.w-full]="fullWidth()">
      @if (label(); as texto) {
        <label [for]="id" class="text-sm font-medium text-text-dark">{{ texto }}</label>
      }

      <div class="relative" [class.w-full]="fullWidth()">
        @if (icono(); as ic) {
          <app-icon
            [name]="ic"
            [size]="14"
            class="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
        }

        <select
          [id]="id"
          [value]="value()"
          (change)="value.set($any($event.target).value)"
          [disabled]="disabled()"
          [attr.aria-label]="label() ? null : ariaLabel() || null"
          [class]="clases()">
          <ng-content />
        </select>

        <!-- La flecha la dibuja el átomo porque el appearance-none de arriba
             quita la del sistema. Sin pointer-events-none se come el clic y el
             desplegable no abre justo donde el usuario apunta. -->
        <app-icon
          name="chevron-down"
          [size]="14"
          class="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
      </div>
    </div>
  `,
})
export class SelectComponent {
  protected readonly id = `crm-select-${nextId++}`;

  readonly label = input<string | undefined>(undefined);
  readonly size = input<SelectSize>('md');
  readonly icono = input<IconName | undefined>(undefined);
  readonly disabled = input(false);
  readonly fullWidth = input(true);

  /** Nombre accesible cuando no hay `label` visible (un filtro de barra). */
  readonly ariaLabel = input<string>('');

  /**
   * Filtro con un valor puesto — se tiñe de primario.
   *
   * Está en el átomo porque los cuatro filtros de Ventas lo resolvían con tres
   * `[class.…]` cada uno (`border-primary`, `text-primary`, `bg-bg-light`), y
   * esa terna repetida doce veces es justo lo que se olvida en el filtro nº 5.
   * Que un filtro esté activo es información, no decoración: sin ella hay que
   * abrir el desplegable para saber si está filtrando algo.
   */
  readonly activo = input(false);

  readonly value = model<string>('');

  protected readonly clases = computed(() => {
    const base =
      'appearance-none rounded-xl border transition-all duration-200 outline-none ' +
      'cursor-pointer focus:border-primary focus:ring-4 focus:ring-primary/10 ' +
      'disabled:opacity-50 disabled:cursor-not-allowed';

    const tono = this.activo()
      ? 'border-primary bg-bg-light text-primary font-semibold'
      : 'border-border bg-white text-text-dark';

    const alturas: Record<SelectSize, string> = {
      sm: 'py-1.5 text-xs font-medium',
      md: 'py-3 text-sm',
    };

    /* El hueco de la izquierda depende de si hay icono, y el de la derecha lo
       reserva siempre la flecha. */
    const izquierda = this.icono() ? 'pl-8' : this.size() === 'sm' ? 'pl-3' : 'pl-4';

    return [base, tono, alturas[this.size()], izquierda, 'pr-9', this.fullWidth() ? 'w-full' : ''].join(' ');
  });
}
