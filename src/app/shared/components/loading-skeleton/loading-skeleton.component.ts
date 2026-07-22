import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export type SkeletonShape = 'text' | 'input' | 'card' | 'pill' | 'circle';

/**
 * Átomo Loading Skeleton — placeholder de carga con pulso suave.
 * Ref: CRM_MANIFESTO.md §4.1.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-loading-skeleton',
  template: `<div [class]="classes()" [style.width]="width()" [style.height]="height()"></div>`,
})
export class LoadingSkeletonComponent {
  readonly shape = input<SkeletonShape>('text');
  readonly width = input<string>('100%');
  readonly height = input<string | undefined>(undefined);

  protected readonly classes = computed(() => {
    const radii: Record<SkeletonShape, string> = {
      text: 'rounded-md',
      input: 'rounded-xl',
      card: 'rounded-2xl',
      pill: 'rounded-full',
      circle: 'rounded-full',
    };

    return [
      'bg-neutral-bg animate-[skeleton-pulse_1.6s_ease-in-out_infinite]',
      radii[this.shape()],
      this.height() ? '' : 'h-4',
    ].join(' ');
  });
}
