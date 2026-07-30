import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Molécula Page Header — encabezado estándar de cada vista del workspace.
 * Título + subtítulo a la izquierda, acciones proyectadas a la derecha.
 *
 * El componente aporta su propia separación con el contenido que sigue: antes
 * no lo hacía y cada vista tenía que acordarse de añadirla, así que el título
 * quedaba pegado al primer bloque (se veía en Planilla de Comisiones). Ponerlo
 * aquí da el mismo ritmo vertical a todas las páginas sin repetir clases.
 *
 * Es `margin-bottom` a propósito, no `padding`: si la vista siguiente ya trae
 * su propio `margin-top`, los márgenes adyacentes colapsan al mayor de los dos
 * en flujo normal y no se suman, de modo que ninguna página existente gana
 * hueco de más.
 *
 * Ref: CRM_MANIFESTO.md §4.2.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-page-header',
  template: `
    <div class="flex flex-wrap items-end justify-between gap-4">
      <div class="min-w-0">
        <h1 class="text-2xl font-bold text-text-dark tracking-tight leading-tight">
          {{ title() }}
        </h1>
        @if (subtitle()) {
          <p class="text-sm text-text-muted mt-1.5 leading-relaxed max-w-2xl">{{ subtitle() }}</p>
        }
      </div>
      <div class="flex items-center gap-3 shrink-0">
        <ng-content />
      </div>
    </div>
  `,
  styles: `
    :host {
      display: block;
      margin-bottom: 1.75rem;
    }

    /* En móvil el espacio en pantalla es caro: se recorta el respiro. */
    @media (max-width: 768px) {
      :host {
        margin-bottom: 1.25rem;
      }
    }
  `,
})
export class PageHeaderComponent {
  readonly title = input.required<string>();
  readonly subtitle = input<string | undefined>(undefined);
}
