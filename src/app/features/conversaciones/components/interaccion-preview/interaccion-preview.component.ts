import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';

import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { IconComponent, IconName } from '../../../../shared/components/icon/icon.component';
import { WhatsAppMarkdownPipe } from '../../../../shared/pipes/whatsapp-markdown.pipe';

/** Proyección de presentación; nunca recibir response_json, originales ni flow_token. */
export interface InteraccionVista {
  tipo: 'botones' | 'lista' | 'seleccion' | 'flow' | 'respuesta_flow' | 'error';
  cuerpo: string;
  opciones?: readonly { id: string; titulo: string; descripcion?: string }[];
  /* Lo que rodea a una oferta, como lo ve la paciente. Las ofertas guardadas antes
     del 2026-10-09 no lo traen: se pinta con el rótulo por defecto. */
  cabecera?: string;
  pie?: string;
  /** Banner de la tarjeta de una promoción (https). */
  imagen?: string;
  /** Rótulo del botón que abre la lista («Ver opciones»). */
  boton?: string;
  /** Rótulo del botón que abre el formulario («Solicitar cita»). */
  cta?: string;
  seleccionId?: string;
  /** Id interno del mensaje al que responde: dentro del mismo chat. */
  contextoId?: string;
  versionFlow?: string;
  proposito?: 'SOLICITUD_CITA' | 'RESERVA_CITA';
  /** Lo que eligió en el formulario, ya con sus etiquetas («Especialidad: Maternidad»). */
  datos?: readonly { etiqueta: string; valor: string }[];
  estado?: 'CORRELACIONADA' | 'CADUCADA' | 'DUPLICADA' | 'NO_CORRELACIONADA' | 'INVALIDA' | 'DESCONOCIDA';
}

/**
 * Lo que la agente tiene que hacer distinto. CORRELACIONADA no lleva aviso: es lo
 * normal (antes decía «Atención por el personal» incluso cuando el CRM ya había
 * contestado solo, que es justo lo que no tenía que creer la agente).
 */
const AVISOS: Readonly<Record<Exclude<NonNullable<InteraccionVista['estado']>, 'CORRELACIONADA'>, string>> = {
  CADUCADA: 'Tocó una opción de un mensaje vencido: confirma con la paciente qué necesita.',
  DUPLICADA: 'Ya había respondido a ese mensaje antes; esta respuesta no hizo nada nuevo.',
  NO_CORRELACIONADA: 'No coincide con ninguna opción que le enviamos: revísalo con la paciente.',
  INVALIDA: 'Llegó incompleta o con datos que no coinciden: revísala con la paciente.',
  DESCONOCIDA: 'WhatsApp mandó una respuesta que el CRM todavía no entiende: revísala con la paciente.',
};

/**
 * Un mensaje interactivo de WhatsApp pintado como lo ve la paciente: el texto con
 * su formato, el pie y los botones debajo (o el botón de la lista, o el del
 * formulario). La respuesta de la paciente se muestra como una cita del mensaje
 * al que responde, y llevarla hasta él es un toque.
 *
 * Dos usos: dentro de una burbuja del chat (`historial`) y como vista previa
 * suelta (el editor del menú), donde lleva su propio fondo y su burbuja.
 */
@Component({
  selector: 'app-interaccion-preview',
  imports: [ButtonComponent, IconComponent, WhatsAppMarkdownPipe],
  templateUrl: './interaccion-preview.component.html',
  styleUrl: './interaccion-preview.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InteraccionPreviewComponent {
  /** El historial recibe exclusivamente la proyección segura del backend. */
  readonly historial = input(false);
  readonly habilitada = input(false);
  readonly cargando = input(false);
  readonly interaccion = input<InteraccionVista | null>(null);
  /** Cabecera propia (p. ej. la vista previa del menú de atención). */
  readonly titulo = input<string | null>(null);
  /** Pide llevar el hilo hasta el mensaje al que responde (su id interno). */
  readonly irAMensaje = output<string>();

  /** Un banner que ya no existe no deja el ícono roto en el chat. */
  protected readonly imagenRota = signal(false);

  /** La línea que encabeza una respuesta de la paciente, como la cita de WhatsApp. */
  protected readonly respuesta = computed<{ icono: IconName; texto: string } | null>(() => {
    const v = this.interaccion();
    if (v?.tipo === 'seleccion') return { icono: 'corner-up-left', texto: 'Tocó una opción' };
    if (v?.tipo === 'respuesta_flow') {
      return { icono: 'file-text', texto: v.proposito === 'RESERVA_CITA' ? 'Reservó desde el formulario' : 'Completó el formulario' };
    }
    return null;
  });

  /** Solo en el chat y si la respuesta está vinculada: el mensaje existe en este hilo. */
  protected readonly enlazable = computed(() => this.historial() && !!this.interaccion()?.contextoId);

  protected readonly aviso = computed(() => {
    const estado = this.interaccion()?.estado;
    return estado && estado !== 'CORRELACIONADA' ? AVISOS[estado] : null;
  });

  protected irAlOriginal(): void {
    const id = this.interaccion()?.contextoId;
    if (id) this.irAMensaje.emit(id);
  }
}
