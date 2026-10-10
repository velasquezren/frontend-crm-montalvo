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
export interface ContextoAtencion extends AtencionFila {
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

/** Las transiciones que ofrece el bloque de atención. */
export type AccionAtencion = 'tomar' | 'liberar' | 'resolver' | 'reanudar';

/** Lo que devuelven las transiciones (`POST …/atencion/tomar`, etc.). */
export interface EstadoDeAtencion {
  readonly id: string;
  readonly estado: EstadoAtencion | null;
  readonly tomadaEn: string | null;
  readonly tomadaPor: { readonly id: string; readonly nombre: string } | null;
  readonly automatizacionPausadaEn: string | null;
}

/** El motivo, dicho como lo diría recepción. */
export const MOTIVO_ATENCION: Readonly<Record<MotivoAtencion, string>> = {
  EMERGENCIA: 'Indicó una emergencia',
  POSIBLE_URGENCIA: 'Posible urgencia (detectada por el asistente)',
  SOLICITUD_EXPLICITA: 'Pidió hablar con una persona',
  SOLICITUD_CITA: 'Solicitud de cita',
  DERIVADA_ASISTENTE: 'El asistente la pasó a una persona',
  COMPROBANTE_PAGO: 'Comprobante por verificar',
  REVISION: 'Respuesta para revisar',
};

/** Qué hacer ahora. Una sola frase, sin prometer nada que el sistema no hizo. */
export const ACCION_ATENCION: Readonly<Record<MotivoAtencion, string>> = {
  EMERGENCIA: 'Contactarla ya. Lo declaró ella: el CRM no evalúa si es una emergencia médica.',
  POSIBLE_URGENCIA: 'Leer su mensaje ya: el asistente cree que puede ser urgente y no le contestó nada médico.',
  SOLICITUD_EXPLICITA: 'Contestarle: está esperando a una persona.',
  SOLICITUD_CITA: 'Revisar la solicitud y proponerle una cita. Todavía no hay nada reservado.',
  DERIVADA_ASISTENTE: 'Contestarle: es una consulta que el asistente no debe responder (médica, una queja o algo dudoso).',
  COMPROBANTE_PAGO: 'Verificar el comprobante en el bloque «Pago» y confirmarlo o pedir otro.',
  REVISION: 'Revisar su respuesta: no se ejecutó ninguna acción automática.',
};

/** El motivo, corto, para la tarjeta del inbox (que no tiene sitio para la frase entera). */
export const MOTIVO_ATENCION_CORTO: Readonly<Record<MotivoAtencion, string>> = {
  EMERGENCIA: 'Emergencia',
  POSIBLE_URGENCIA: 'Posible urgencia',
  SOLICITUD_EXPLICITA: 'Pidió persona',
  SOLICITUD_CITA: 'Solicitud de cita',
  DERIVADA_ASISTENTE: 'Derivada',
  COMPROBANTE_PAGO: 'Comprobante',
  REVISION: 'Revisar',
};

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
