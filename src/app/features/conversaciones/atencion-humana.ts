import { MotivoAtencion } from '../../core/api/db-enums';

/*
 * Atención humana (backend: docs/atencion-humana.md). El servidor decide el
 * estado, el motivo y la prioridad; aquí solo se dicen con palabras. Ninguna
 * regla de negocio vive en este archivo: si una etiqueta parece necesitar una
 * condición nueva, esa condición va en `atencion-humana.ts` del backend.
 */

export type EstadoAtencion = 'ESPERANDO' | 'EN_ATENCION';
export type PrioridadAtencion = 'NORMAL' | 'ALTA' | 'CRITICA';

/** La solicitud tal como viaja en cada fila del inbox. */
export interface AtencionFila {
  readonly estado: EstadoAtencion;
  readonly motivo: MotivoAtencion;
  readonly prioridad: PrioridadAtencion;
  /** Desde cuándo espera a una persona. No se reinicia al recargar. */
  readonly solicitadaEn: string;
  readonly tomadaEn: string | null;
  readonly tomadaPor: { readonly id: string; readonly nombre: string } | null;
}

/** Un dato elegido en un Flow aprobado, ya con su etiqueta. */
export interface DatoDeFlow {
  readonly etiqueta: string;
  readonly valor: string;
}

/**
 * El contexto del traspaso, en el detalle del chat. Determinista: solo datos
 * que existen. `origen` y `ultimoMensaje` faltan mientras se ve la cabecera
 * provisional (armada desde la fila del inbox), hasta que llega el detalle.
 */
/** Por qué el asistente la pasó a una persona (backend: `razonDeDerivacion`). */
export type RazonDerivacion = 'FALLO' | 'MEDICO' | 'URGENCIA' | 'QUEJA' | 'PERSONA' | 'DUDA';

export interface ContextoAtencion extends AtencionFila {
  readonly explicacionAsistente?: string | null;
  readonly razonAsistente?: RazonDerivacion | null;
  readonly origen?: {
    readonly tipo: string;
    readonly cuerpo: string;
    readonly recibidoEn: string;
    readonly datos: readonly DatoDeFlow[];
    readonly versionFlow: string | null;
    readonly ofrecido: { readonly cuerpo: string; readonly opciones: readonly string[] } | null;
  } | null;
  readonly ultimoMensaje?: { readonly contenido: string; readonly createdAt: string } | null;
}

/** Las transiciones que ofrece el bloque de atención. `listo` = resolver y reanudar en un paso. */
export type AccionAtencion = 'tomar' | 'liberar' | 'resolver' | 'reanudar' | 'listo';

/** Lo que devuelven las transiciones (`POST …/atencion/tomar`, etc.). */
export interface EstadoDeAtencion {
  readonly id: string;
  readonly estado: EstadoAtencion | null;
  readonly tomadaEn: string | null;
  readonly tomadaPor: { readonly id: string; readonly nombre: string } | null;
  readonly automatizacionPausadaEn: string | null;
}

/*
 * Las palabras de la pantalla. Una regla: decir QUÉ PASÓ con la paciente y QUÉ
 * HACER, como se lo diría una recepcionista a otra; nunca la jerga interna
 * («atención humana», «derivada», «solicitud»).
 */

/** Qué pasó, en el título del bloque del chat. */
export const MOTIVO_ATENCION: Readonly<Record<MotivoAtencion, string>> = {
  EMERGENCIA: 'Dice que es una emergencia',
  POSIBLE_URGENCIA: 'Podría ser urgente',
  SOLICITUD_EXPLICITA: 'Quiere hablar con una persona',
  SOLICITUD_CITA: 'Pidió una cita',
  DERIVADA_ASISTENTE: 'La IA te pasó este chat',
  COMPROBANTE_PAGO: 'Mandó un comprobante de pago',
  REVISION: 'Hay una respuesta para revisar',
};

/** Qué hacer ahora. Una sola frase, sin prometer nada que el sistema no hizo. */
export const ACCION_ATENCION: Readonly<Record<MotivoAtencion, string>> = {
  EMERGENCIA: 'Escríbele o llámala ya. Lo dijo ella: el CRM no evalúa si es una emergencia médica.',
  POSIBLE_URGENCIA: 'Lee su mensaje ya. La IA no le respondió nada médico.',
  SOLICITUD_EXPLICITA: 'Escríbele: está esperando a alguien del equipo.',
  SOLICITUD_CITA: 'Revisa «Próximas reservas» antes de confirmarle o crear otra cita.',
  DERIVADA_ASISTENTE: 'Lee lo que preguntó y respóndele tú.',
  COMPROBANTE_PAGO: 'Revisa el comprobante en el bloque «Pago» y confírmalo o pide otro.',
  REVISION: 'Revisa lo que respondió: no se hizo nada automático.',
};

/** Cuando la pasó la IA, la causa concreta manda sobre el «la IA te pasó este chat» genérico. */
export const RAZON_ASISTENTE: Readonly<Record<RazonDerivacion, { readonly titulo: string; readonly accion: string }>> = {
  FALLO: { titulo: 'La IA no pudo responder', accion: 'Respóndele tú: la IA falló antes de terminar.' },
  MEDICO: { titulo: 'Pregunta médica', accion: 'Que le responda alguien del equipo clínico. La IA no da indicaciones médicas.' },
  URGENCIA: { titulo: 'Podría ser urgente', accion: 'Lee su mensaje ya. La IA no le respondió nada médico.' },
  QUEJA: { titulo: 'Posible reclamo', accion: 'Revisa qué pasó antes de ofrecerle algo.' },
  PERSONA: { titulo: 'Quiere hablar con una persona', accion: 'Escríbele: está esperando a alguien del equipo.' },
  DUDA: { titulo: 'La IA no supo responder', accion: 'Lee lo que preguntó y respóndele tú.' },
};

/** El título y el qué hacer de una solicitud, con la causa de la IA si la hay. */
export function textosDeAtencion(a: Pick<ContextoAtencion, 'motivo' | 'razonAsistente'>): { titulo: string; accion: string } {
  const razon = a.razonAsistente ? RAZON_ASISTENTE[a.razonAsistente] : null;
  return razon ?? { titulo: MOTIVO_ATENCION[a.motivo], accion: ACCION_ATENCION[a.motivo] };
}

/** El motivo, corto, para la tarjeta del inbox (que no tiene sitio para la frase entera). */
export const MOTIVO_ATENCION_CORTO: Readonly<Record<MotivoAtencion, string>> = {
  EMERGENCIA: 'Emergencia',
  POSIBLE_URGENCIA: 'Posible urgencia',
  SOLICITUD_EXPLICITA: 'Quiere una persona',
  SOLICITUD_CITA: 'Pide cita',
  DERIVADA_ASISTENTE: 'La IA te la pasó',
  COMPROBANTE_PAGO: 'Comprobante',
  REVISION: 'Revisar',
};

/** Quién la atiende, en la tarjeta y en el chat: «La atiendes tú» o «Ana la atiende». */
export function quienAtiende(tomadaPor: { readonly id: string; readonly nombre: string }, yo: string | null): string {
  return tomadaPor.id === yo ? 'La atiendes tú' : `${primerNombre(tomadaPor.nombre)} la atiende`;
}

/**
 * Cuánto lleva esperando, en el formato del resto de la bandeja («12 min»,
 * «3 h», «2 d»). Se calcula desde la hora del servidor, así que recargar no
 * lo reinicia.
 */
export function tiempoDeEspera(desde: string, ahora = Date.now()): string {
  const minutos = Math.max(1, Math.floor((ahora - new Date(desde).getTime()) / 60000));
  if (minutos < 60) return `${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `${horas} h`;
  return `${Math.floor(horas / 24)} d`;
}

/** El primer nombre: «En atención por Ana», como `describirCierre`. */
export function primerNombre(nombre: string): string {
  return nombre.split(' ')[0] || nombre;
}

/**
 * El ícono de una solicitud: la emergencia se distingue también por forma, no
 * solo por color —el `critical` de la paleta es negro, y la tarjeta tiene que
 * leerse igual en una pantalla con poco contraste—.
 */
export function iconoDeAtencion(prioridad: PrioridadAtencion): 'alert-circle' | 'user' {
  return prioridad === 'CRITICA' ? 'alert-circle' : 'user';
}

/**
 * El color de la solicitud en la tarjeta, alineado con el bloque del chat: el
 * `critical` (negro) es solo de la emergencia; pedir una persona va en primario y
 * lo demás en `info`. Si la alta fuera negra también, «primero la emergencia» no
 * se vería en la bandeja.
 */
export function varianteDeAtencion(prioridad: PrioridadAtencion): 'critical' | 'success' | 'info' {
  return prioridad === 'CRITICA' ? 'critical' : prioridad === 'ALTA' ? 'success' : 'info';
}
