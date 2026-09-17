import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { IconComponent } from '../../shared/components/icon/icon.component';
import { PwaUpdateService } from './pwa-update.service';

/**
 * Rastro permanente de "hay versión nueva", en la cabecera.
 *
 * El toast ya existía y se queda, pero es efímero por definición: se cierra con
 * un clic y compite con todos los demás avisos. El 2026-09-17 el bucle 401
 * llenó la pantalla de toasts de error —y un aviso de versión ahí dentro no lo
 * ve nadie—, mientras el navegador seguía ejecutando código viejo y enviando
 * mensajes sin `clientMessageId`.
 *
 * Por eso este indicador no se puede descartar: desaparece cuando la app
 * recarga con la versión nueva, y hasta entonces no. Es un botón pequeño y no
 * un banner a propósito: interrumpir a una agente que está atendiendo cuesta
 * más que la actualización que estamos pidiendo.
 */
@Component({
  selector: 'app-actualizacion-disponible',
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (pwaUpdate.actualizacionPendiente()) {
      <button
        type="button"
        (click)="actualizar()"
        class="flex items-center gap-1.5 h-8 px-2 sm:px-2.5 rounded-lg shrink-0
               text-info bg-info-bg border border-info/20
               hover:bg-info/15 transition-colors duration-200 cursor-pointer"
        title="Nueva versión del CRM disponible — haz clic para actualizar"
        aria-label="Nueva versión disponible, actualizar ahora">
        <app-icon name="rotate-cw" [size]="14" />
        <span class="hidden sm:inline text-[11px] font-semibold whitespace-nowrap">Actualizar</span>
      </button>
    }
  `,
})
export class ActualizacionDisponibleComponent {
  protected readonly pwaUpdate = inject(PwaUpdateService);

  protected actualizar(): void {
    void this.pwaUpdate.aplicarActualizacion();
  }
}
