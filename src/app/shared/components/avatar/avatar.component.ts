import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export type AvatarSize = 'sm' | 'md' | 'lg';
export type AvatarVariant = 'light' | 'solid';

/**
 * Átomo Avatar — círculo de iniciales, usado en topbar y futuras listas
 * de conversaciones/clientes. Ref: CRM_MANIFESTO.md §3.1 (bg-light + text-primary).
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-avatar',
  template: `
    @if (imageUrl()) {
      <img [src]="imageUrl()" [class]="imgClasses()" alt="Avatar" />
    } @else {
      <div [class]="classes()">
        <span class="font-semibold leading-none">{{ initials() }}</span>
      </div>
    }
  `,
})
export class AvatarComponent {
  readonly initials = input.required<string>();
  readonly size = input<AvatarSize>('md');
  readonly variant = input<AvatarVariant>('light');
  readonly imageUrl = input<string | null | undefined>(undefined);

  protected readonly imgClasses = computed(() => {
    const sizes: Record<AvatarSize, string> = {
      sm: 'w-8 h-8',
      md: 'w-10 h-10',
      lg: 'w-14 h-14',
    };
    return [
      'rounded-full object-cover shrink-0 border border-border/40',
      sizes[this.size()],
    ].join(' ');
  });

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
