import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import { IconComponent, IconName } from '../icon/icon.component';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'critical';
/**
 * `xs` existe para las acciones de solo ícono dentro de filas densas (editar,
 * copiar, quitar en una tabla o en una lista): eran botones a mano con cinco
 * tamaños —24, 26, 28, 30, 32 px— y dos radios, ninguno el de la píldora.
 * `sm` es el de las cabeceras y barras (el cerrar de `<app-drawer>`).
 */
export type ButtonSize = 'xs' | 'sm' | 'md';

/**
 * Átomo Button — CRM_MANIFESTO.md §3.2: siempre píldora (rounded-full).
 * Reemplaza los <button> estilizados a mano que existían en login/layout.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-button',
  imports: [IconComponent],
  template: `
    <button
      [type]="type()"
      [disabled]="disabled() || loading()"
      [class]="classes()"
      [attr.aria-label]="ariaLabel() || null"
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
  /**
   * Nombre accesible. Obligatorio en los botones solo-ícono: sin texto
   * proyectado, un `<button>` con un `<svg>` dentro se anuncia como "botón" a
   * secas y el lector de pantalla no dice qué hace. `check:skills` lo exige
   * cuando hay `icon` y no hay contenido entre las etiquetas.
   */
  readonly ariaLabel = input<string>('');

  readonly clicked = output<MouseEvent>();

  protected readonly iconSize = computed(() => (this.size() === 'md' ? 16 : 14));

  protected readonly classes = computed(() => {
    /* `ease-(--ease-spring-smooth)` y no `cubic-bezier(…)` suelto: escrita
       como clase, la curva eran cuatro clases que Tailwind no conoce
       («cubic-bezier(0.16,», «1,»…) y todos los botones del CRM se animaban
       con el `ease` por defecto en vez de con la curva del sistema. */
    const base =
      'inline-flex items-center justify-center gap-2 rounded-full font-semibold ' +
      'transition-all duration-200 ease-(--ease-spring-smooth) active:scale-[0.97] active:duration-75 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed select-none';

    const sizes: Record<ButtonSize, string> = this.circle()
      ? { xs: 'w-7 h-7 p-0 shrink-0', sm: 'w-9 h-9 p-0 shrink-0', md: 'w-11 h-11 p-0 shrink-0' }
      : { xs: 'px-3 py-1 text-[11px]', sm: 'px-4 py-2 text-xs', md: 'px-5 py-2.5 text-sm' };

    const variants: Record<ButtonVariant, string> = {
      primary: 'bg-primary text-white shadow-subtle hover:opacity-90',
      secondary:
        'bg-white text-primary border border-border hover:bg-bg-light hover:border-primary/30',
      ghost: 'bg-transparent text-text-muted hover:text-primary hover:bg-bg-light',
      /* Acción destructiva (cancelar, eliminar). No inventa un tono: `critical`
         es NEGRO en esta paleta, no rojo de alarma — la línea "premium médico"
         del manifiesto §3.4. Nace de promover al átomo lo que el cajón de
         Actividades ya escribía a mano (`border-critical/30 text-critical
         hover:bg-critical-bg`) en dos botones distintos. */
      critical:
        'bg-white text-critical border border-critical/30 hover:bg-critical-bg hover:border-critical/50',
    };

    const width = this.fullWidth() ? 'w-full' : '';

    return [base, sizes[this.size()], variants[this.variant()], width].join(' ');
  });
}
