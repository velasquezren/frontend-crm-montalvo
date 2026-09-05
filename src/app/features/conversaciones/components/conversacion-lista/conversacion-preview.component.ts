import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { IconComponent } from '../../../../shared/components/icon/icon.component';
import { MensajeApi } from '../../conversacion.model';

/**
 * Vista previa del último mensaje en la tarjeta de conversación de la bandeja.
 * Encapsula la iconografía de tipo (audio, video, imagen, documento) y los ticks de entrega.
 */
@Component({
  selector: 'app-conversacion-preview',
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (mensaje(); as ultimo) {
      <p class="text-xs text-text-muted truncate leading-snug flex items-center gap-1">
        @if (ultimo.direccion === 'SALIENTE') {
          @switch (ultimo.estadoEnvio) {
            @case ('LEIDO') {
              <app-icon name="check-check" [size]="14" class="text-secondary shrink-0" title="Leído" />
            }
            @case ('ENTREGADO') {
              <app-icon name="check-check" [size]="14" class="text-text-muted/70 shrink-0" title="Entregado" />
            }
            @case ('FALLIDO') {
              <span class="text-text-critical font-semibold text-[11px] shrink-0 leading-none" title="Falló el envío">No enviado</span>
            }
            @default {
              <app-icon name="check" [size]="14" class="text-text-muted/70 shrink-0" title="Enviado" />
            }
          }
        }
        @switch (ultimo.tipo) {
          @case ('IMAGEN') {
            <span class="inline-flex items-center gap-1 font-medium text-text-dark truncate">
              <app-icon name="image" [size]="12" class="text-primary shrink-0" />
              <span>Foto</span>
              @if (ultimo.contenido) {
                <span class="text-text-muted font-normal truncate">· {{ ultimo.contenido }}</span>
              }
            </span>
          }
          @case ('STICKER') {
            <span class="inline-flex items-center gap-1 font-medium text-text-dark truncate">
              <app-icon name="image" [size]="12" class="text-primary shrink-0" />
              <span>Sticker</span>
            </span>
          }
          @case ('VIDEO') {
            <span class="inline-flex items-center gap-1 font-medium text-text-dark truncate">
              <app-icon name="video" [size]="12" class="text-primary shrink-0" />
              <span>Video</span>
              @if (ultimo.contenido) {
                <span class="text-text-muted font-normal truncate">· {{ ultimo.contenido }}</span>
              }
            </span>
          }
          @case ('AUDIO') {
            <span class="inline-flex items-center gap-1 font-medium text-text-dark truncate">
              <app-icon name="volume-2" [size]="12" class="text-primary shrink-0" />
              <span>Mensaje de voz</span>
            </span>
          }
          @case ('DOCUMENTO') {
            <span class="inline-flex items-center gap-1 font-medium text-text-dark truncate">
              <app-icon name="file-text" [size]="12" class="text-primary shrink-0" />
              <span class="truncate">{{ ultimo.mediaNombre || ultimo.contenido || 'Documento' }}</span>
            </span>
          }
          @default {
            <span class="truncate">{{ ultimo.contenido }}</span>
          }
        }
      </p>
    } @else {
      <p class="text-xs text-text-muted/50 italic truncate">Sin mensajes</p>
    }
  `,
})
export class ConversacionPreviewComponent {
  readonly mensaje = input<MensajeApi | undefined>(undefined);
}
