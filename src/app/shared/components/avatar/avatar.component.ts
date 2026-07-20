import { Component, computed, input } from '@angular/core';

export type AvatarSize = 'sm' | 'md' | 'lg';
export type AvatarVariant = 'light' | 'solid';

/**
 * Átomo Avatar — círculo de iniciales, usado en topbar y futuras listas
 * de conversaciones/clientes. Ref: CRM_MANIFESTO.md §3.1 (bg-light + text-primary).
 */
@Component({
  selector: 'app-avatar',
  template: `
    <div [class]="classes()">
      <span class="font-semibold leading-none">{{ initials() }}</span>
    </div>
  `,
})
export class AvatarComponent {
  readonly initials = input.required<string>();
  readonly size = input<AvatarSize>('md');
  readonly variant = input<AvatarVariant>('light');

  protected readonly classes = computed(() => {
    const sizes: Record<AvatarSize, string> = {
      sm: 'w-8 h-8 text-xs',
      md: 'w-10 h-10 text-sm',
      lg: 'w-14 h-14 text-xl',
    };

    const variants: Record<AvatarVariant, string> = {
      light: 'bg-bg-light text-primary',
      solid: 'bg-primary text-white',
    };

    return [
      'inline-flex items-center justify-center rounded-full shrink-0',
      sizes[this.size()],
      variants[this.variant()],
    ].join(' ');
  });
}
