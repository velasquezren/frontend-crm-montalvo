import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { IconComponent } from '../../../../shared/components/icon/icon.component';
import { MensajeApi } from '../../conversacion.model';
import { explicacionErrorWhatsapp } from '../../error-whatsapp';
import { sinFormato } from '../../vista-previa';

/**
 * Vista previa del último mensaje en la tarjeta de conversación de la bandeja.
 * Encapsula la iconografía de tipo (audio, video, imagen, documento) y los ticks de entrega.
 */
@Component({
  selector: 'app-conversacion-preview',
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (borrador(); as texto) {
      <!-- Lo que quedó escrito sin enviar, como «Borrador:» de WhatsApp: manda sobre el último mensaje. -->
      <p class="text-xs text-text-muted truncate leading-snug flex items-center gap-1">
        <span class="font-semibold text-primary shrink-0">Borrador:</span>
        <span class="truncate">{{ texto }}</span>
      </p>
    } @else if (mensaje(); as ultimo) {
      <p class="text-xs truncate leading-snug flex items-center gap-1"
        [class.text-text-muted]="!destacado()" [class.text-text-dark]="destacado()" [class.font-medium]="destacado()">
        @if (ultimo.direccion === 'SALIENTE') {
          @switch (ultimo.estadoEnvio) {
            @case ('LEIDO') {
              <app-icon name="check-check" [size]="14" class="text-secondary shrink-0" title="Leído" />
            }
            @case ('ENTREGADO') {
              <app-icon name="check-check" [size]="14" class="text-text-muted/70 shrink-0" title="Entregado" />
            }
            @case ('FALLIDO') {
              <span class="text-critical font-semibold text-[11px] shrink-0 leading-none" [title]="errorWhatsapp(ultimo.codigoErrorEnvio)">No enviado</span>
            }
            @case ('INCIERTO') {
              <span
                class="text-text-muted font-semibold text-[11px] shrink-0 leading-none"
                title="No se pudo confirmar si llegó; no lo reenvíes todavía">Sin confirmar</span>
            }
            @default {
              <app-icon name="check" [size]="14" class="text-text-muted/70 shrink-0" title="Enviado" />
            }
          }
          <!-- Lo último lo contestó la IA: se ve sin abrir el chat. -->
          @if (ultimo.asistente) {
            <app-icon name="bot" [size]="13" class="text-primary shrink-0" title="Lo respondió el asistente de IA" />
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
            <!-- Sin los asteriscos del formato, como la lista de WhatsApp. -->
            <span class="truncate">{{ texto(ultimo.contenido) }}</span>
          }
        }
      </p>
    } @else {
      <p class="text-xs text-text-muted/50 italic truncate">Sin mensajes</p>
    }
  `,
})
export class ConversacionPreviewComponent {
  protected readonly errorWhatsapp = explicacionErrorWhatsapp;
  protected readonly texto = sinFormato;
  readonly mensaje = input<MensajeApi | undefined>(undefined);
  /** Texto escrito y sin enviar en ese chat; si hay, se muestra en lugar del último mensaje. */
  readonly borrador = input<string | null>(null);
  /** Hay mensajes sin leer: el texto va en oscuro, como en WhatsApp. */
  readonly destacado = input(false);
}
