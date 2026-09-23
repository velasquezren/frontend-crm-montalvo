import { soloDigitos } from '../../shared/models/telefono';
import { ConversacionResumen } from './conversacion.model';

/**
 * Cómo se llega al chat de una paciente desde otra pantalla, y qué se abre.
 *
 * Había cuatro contratos para lo mismo —`busqueda`, `telefono`, `clienteId` y
 * `id`— y uno de ellos, el `clienteId` del botón «Conversación» de la ficha en
 * Clientes, la bandeja no lo leía: el botón llevaba a la bandeja sin abrir
 * nada. Ahora todo enlace a la paciente va por teléfono (`enlaceAlChat`), que
 * es su identidad en WhatsApp y lo que tienen a mano todas las pantallas.
 */
export function enlaceAlChat(telefono: string): { telefono: string } {
  return { telefono };
}

export type ChatDePaciente =
  | { readonly tipo: 'UNO'; readonly id: string }
  | { readonly tipo: 'VARIOS' }
  | { readonly tipo: 'NINGUNO' };

/**
 * Entre los chats que devolvió la búsqueda, los de ESA paciente.
 *
 * Coincidencia exacta de número, no «contiene»: la búsqueda del servidor sí es
 * por fragmento, y abrir el chat de otra persona cuyo número contiene los
 * dígitos buscados es peor que no abrir ninguno. Varios = la paciente escribe
 * por más de una línea; la agente elige cuál.
 */
export function resolverChatDePaciente(chats: readonly ConversacionResumen[], telefono: string): ChatDePaciente {
  const buscado = soloDigitos(telefono);
  const suyos = chats.filter(c => soloDigitos(c.cliente.telefono) === buscado);
  if (suyos.length === 1) return { tipo: 'UNO', id: suyos[0]!.id };
  return suyos.length > 1 ? { tipo: 'VARIOS' } : { tipo: 'NINGUNO' };
}
