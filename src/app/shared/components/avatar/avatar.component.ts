import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';

import { urlDeLaApi } from '../../../core/api/api.constants';

export type AvatarSize = 'sm' | 'md' | 'lg';
export type AvatarVariant = 'light' | 'solid';

/**
 * Átomo Avatar — círculo de iniciales, usado en topbar y futuras listas
 * de conversaciones/clientes. Ref: CRM_MANIFESTO.md §3.1 (bg-light + text-primary).
 *
 * Con foto: se carga perezosa (una lista de 25 médicos no baja 25 fotos que
 * no se ven) y, si no carga, quedan las iniciales en vez del ícono roto. Una
 * URL relativa de la API (`/publico/…`) se completa con su base.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-avatar',
  template: `
    @if (src(); as url) {
      <img
        [src]="url"
        [class]="imgClasses()"
        [alt]="nombre() ? 'Foto de ' + nombre() : 'Foto de perfil'"
        [attr.width]="pixeles()"
        [attr.height]="pixeles()"
        loading="lazy"
        decoding="async"
        (error)="fallo.set(url)" />
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
  /**
   * Nombre de la persona, solo para el texto alternativo de la foto.
   *
   * Sin él la imagen anunciaba "Avatar" a un lector de pantalla, que es el
   * nombre del componente y no dice de quién es la cara. Las iniciales tampoco
   * servían: se leen letra a letra.
   */
  readonly nombre = input<string | null | undefined>(undefined);

  /** La URL que no cargó: con otra (otro médico en la misma fila), se vuelve a intentar. */
  protected readonly fallo = signal<string | null>(null);

  protected readonly src = computed(() => {
    const url = urlDeLaApi(this.imageUrl());
    return url && url !== this.fallo() ? url : null;
  });

  protected readonly pixeles = computed(() => ({ sm: 32, md: 40, lg: 56 })[this.size()]);

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
