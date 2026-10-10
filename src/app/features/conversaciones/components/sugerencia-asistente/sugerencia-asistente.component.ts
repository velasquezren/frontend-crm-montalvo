import { ChangeDetectionStrategy, Component, inject, linkedSignal } from '@angular/core';

import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { IconComponent } from '../../../../shared/components/icon/icon.component';
import { etiquetaDeAccion } from '../../asistente-chat';
import { ConversacionesStateService } from '../../services/conversaciones-state.service';

/**
 * La respuesta que el asistente le preparó a la agente (modo SUGERIR,
 * backend: docs/asistente-ia.md). Va justo encima de la caja de texto porque
 * es eso: un borrador.
 *
 * «Usar» la lleva a la caja —no la envía—: la agente la revisa y la manda
 * ella. Las acciones (la tarjeta de una promoción, la imagen de un horario)
 * salen al pulsarlas. Con un aviso («Consulta médica») y sin texto, el
 * asistente no redactó nada a propósito: lo escribe una persona.
 */
@Component({
  selector: 'app-sugerencia-asistente',
  imports: [ButtonComponent, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './sugerencia-asistente.component.html',
  styleUrl: './sugerencia-asistente.component.css',
})
export class SugerenciaAsistenteComponent {
  protected readonly state = inject(ConversacionesStateService);
  protected readonly etiqueta = etiquetaDeAccion;

  /** Un texto largo se ve recortado hasta que se pide entero; cada sugerencia nueva empieza recortada. */
  protected readonly entera = linkedSignal({ source: () => this.state.sugerencia()?.id, computation: () => false });
}
