import type { MensajeApi } from './conversacion.model';

/**
 * Cómo se lee el tiempo y el ritmo de un chat: la hora de cada fila de la
 * bandeja y qué mensajes van pegados en el hilo. Funciones puras: las prueba
 * `presentacion-chat.spec.ts` sin montar nada.
 */

const MINUTOS_TANDA = 5;

/** Medianoche local de una fecha, para contar días de calendario y no de 24 h. */
function dia(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/**
 * La hora de una fila de la bandeja, como la lista de WhatsApp: «10:42» si fue
 * hoy, «Ayer», el día de la semana si fue esta semana y la fecha si es más viejo.
 *
 * Antes decía «3h». En una fila que espera respuesta eso repetía el reloj de
 * espera de al lado («3 h»), y para saber a qué hora escribió había que abrir
 * el chat.
 */
export function horaDeFila(fecha: Date, ahora: Date): string {
  const dias = Math.round((dia(ahora) - dia(fecha)) / 86_400_000);
  if (dias <= 0) return fecha.toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit', hour12: false });
  if (dias === 1) return 'Ayer';
  if (dias < 7) {
    const nombre = fecha.toLocaleDateString('es-BO', { weekday: 'long' });
    return nombre.charAt(0).toUpperCase() + nombre.slice(1);
  }
  return fecha.toLocaleDateString('es-BO', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

/** Quién habla en un mensaje: la paciente, una persona concreta del equipo, el asistente o el CRM. */
function voz(m: MensajeApi): string {
  if (m.direccion === 'ENTRANTE') return 'paciente';
  if (m.asistente) return 'asistente';
  if (m.automatico) return 'automatico';
  return `persona:${m.autor?.id ?? ''}`;
}

/**
 * ¿`actual` sigue la tanda de `anterior`? Misma voz y a menos de cinco minutos.
 * Entonces el hilo lo pega al anterior y no repite quién lo escribió, como
 * WhatsApp: lo que se lee es la conversación, no una pila de globos sueltos.
 */
export function continuaTanda(anterior: MensajeApi | undefined, actual: MensajeApi): boolean {
  if (!anterior || voz(anterior) !== voz(actual)) return false;
  const minutos = (new Date(actual.createdAt).getTime() - new Date(anterior.createdAt).getTime()) / 60_000;
  return minutos >= 0 && minutos < MINUTOS_TANDA;
}

/**
 * El nombre con que el hilo firma un mensaje de OTRA persona del equipo: «Ana».
 * Lo propio no se firma, como en un grupo de WhatsApp: en un chat que solo
 * contesta una agente no aparece nada, y en uno compartido se ve quién dijo qué.
 */
export function firmaDeAutor(autor: MensajeApi['autor'], usuarioId: string): string | null {
  if (!autor || autor.id === usuarioId) return null;
  return autor.nombre.trim().split(/\s+/)[0] || null;
}
