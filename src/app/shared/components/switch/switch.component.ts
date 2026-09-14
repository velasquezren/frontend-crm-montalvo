import { ChangeDetectionStrategy, Component, computed, input, model } from '@angular/core';

/**
 * Átomo Switch — enciende o apaga una capacidad.
 *
 * **Por qué existe.** Era el único control del sistema que seguía siendo un
 * `<input type="checkbox">` nativo, sin estilar: en `/lineas-whatsapp`, para
 * "Habilitar envíos desde esta línea". Un checkbox del sistema operativo en
 * medio de un formulario de la marca se ve exactamente como lo que es —algo que
 * nadie diseñó— y encima decía mal lo que hace: un checkbox marca una opción de
 * un conjunto; esto **enciende el envío real de WhatsApp a pacientes**. Por eso
 * es un switch, con `role="switch"` y `aria-checked`, que es lo que un lector de
 * pantalla necesita para anunciarlo como "activado/desactivado" y no como
 * "casilla".
 *
 * Two-way con `model()`, igual que `<app-input>`: `<app-switch [(value)]="activa" />`.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-switch',
  template: `
    <button
      type="button"
      role="switch"
      [attr.aria-checked]="value()"
      [attr.aria-label]="ariaLabel() || null"
      [disabled]="disabled()"
      [class]="clasesBoton()"
      (click)="alternar()">
      <span [class]="clasesPerilla()"></span>
    </button>
  `,
})
export class SwitchComponent {
  readonly value = model(false);
  readonly disabled = input(false);
  /** Obligatorio si no hay un `<label>` propio al lado que lo nombre. */
  readonly ariaLabel = input<string>('');

  protected alternar(): void {
    if (!this.disabled()) this.value.update(v => !v);
  }

  protected readonly clasesBoton = computed(() => {
    const base =
      'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors duration-200 ' +
      'cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ' +
      'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';

    return this.value()
      ? `${base} bg-primary border-primary`
      : `${base} bg-bg-workspace border-border`;
  });

  /* La perilla se mueve con `translate-x`, no cambiando `left`: así la anima la
     GPU y no dispara un reflow en cada cuadro. */
  protected readonly clasesPerilla = computed(() => {
    const base =
      'pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-subtle transition-transform duration-200';
    return this.value() ? `${base} translate-x-6` : `${base} translate-x-1`;
  });
}
