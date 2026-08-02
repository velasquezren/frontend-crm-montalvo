import { Overlay, OverlayRef } from '@angular/cdk/overlay';
import { TemplatePortal } from '@angular/cdk/portal';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  input,
  signal,
  TemplateRef,
  ViewChild,
  ViewContainerRef,
} from '@angular/core';

import { IconComponent } from '../icon/icon.component';

/**
 * El "!" que explica cómo se calcula algo.
 *
 * Nace de una necesidad concreta: la planilla de comisiones tiene reglas que
 * nadie recuerda de memoria (el objetivo es una franquicia, el nivel de cirugía
 * sale del acumulado, el bono de jefatura lo cobra publicidad). En vez de que
 * cada agente pregunte, la explicación vive al lado del número.
 *
 * Usa CDK Overlay y no un `position: absolute` porque casi siempre va dentro de
 * `<app-table>`, que scrollea en horizontal: un panel posicionado en absoluto se
 * recorta contra el borde de la tabla. El overlay se proyecta al body y además
 * se limpia solo con el `DestroyRef` del componente que lo usa.
 *
 * ```html
 * <app-info-hint titulo="Comisión Tipo A">
 *   Solo comisionan los planes que superan el objetivo.
 * </app-info-hint>
 * ```
 */
@Component({
  selector: 'app-info-hint',
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      #disparador
      type="button"
      class="inline-flex items-center justify-center align-middle rounded-full text-text-muted
             hover:text-primary hover:bg-bg-light transition-all duration-200 p-0.5 cursor-pointer"
      [class.text-primary]="abierto()"
      [class.bg-bg-light]="abierto()"
      [attr.aria-label]="'Cómo funciona: ' + titulo()"
      [attr.aria-expanded]="abierto()"
      (click)="alternar($event)">
      <app-icon name="alert-circle" [size]="size()" />
    </button>

    <ng-template #panel>
      <div
        class="bg-white rounded-2xl shadow-lifted border border-border p-4 max-w-xs
               animate-fade-scale pointer-events-auto"
        role="tooltip">
        <p class="text-sm font-bold text-text-dark mb-1.5">{{ titulo() }}</p>
        <div class="text-xs text-text-muted leading-relaxed space-y-2">
          <ng-content />
        </div>
      </div>
    </ng-template>
  `,
})
export class InfoHintComponent {
  private readonly overlay = inject(Overlay);
  private readonly vcr = inject(ViewContainerRef);
  private readonly destroyRef = inject(DestroyRef);

  readonly titulo = input.required<string>();
  readonly size = input<number>(14);

  protected readonly abierto = signal(false);

  @ViewChild('disparador', { static: true }) private disparador!: ElementRef<HTMLElement>;
  @ViewChild('panel', { static: true }) private panel!: TemplateRef<unknown>;

  private overlayRef?: OverlayRef;

  constructor() {
    // Si la vista muere con el panel abierto, el overlay se va con ella.
    this.destroyRef.onDestroy(() => this.cerrar());
  }

  protected alternar(evento: MouseEvent): void {
    // La ayuda suele vivir dentro de una fila clicable; abrirla no debe además
    // seleccionar la fila.
    evento.stopPropagation();

    if (this.abierto()) {
      this.cerrar();
      return;
    }

    this.overlayRef = this.overlay.create({
      hasBackdrop: true,
      backdropClass: 'cdk-overlay-transparent-backdrop',
      scrollStrategy: this.overlay.scrollStrategies.reposition(),
      positionStrategy: this.overlay
        .position()
        .flexibleConnectedTo(this.disparador)
        .withPush(true)
        .withPositions([
          { originX: 'center', originY: 'bottom', overlayX: 'center', overlayY: 'top', offsetY: 8 },
          { originX: 'center', originY: 'top', overlayX: 'center', overlayY: 'bottom', offsetY: -8 },
          { originX: 'end', originY: 'bottom', overlayX: 'end', overlayY: 'top', offsetY: 8 },
        ]),
    });

    this.overlayRef.attach(new TemplatePortal(this.panel, this.vcr));
    this.overlayRef.backdropClick().subscribe(() => this.cerrar());
    this.overlayRef.keydownEvents().subscribe(e => {
      if (e.key === 'Escape') this.cerrar();
    });
    this.abierto.set(true);
  }

  private cerrar(): void {
    this.overlayRef?.dispose();
    this.overlayRef = undefined;
    this.abierto.set(false);
  }
}
