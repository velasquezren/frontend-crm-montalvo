import { DatosExtra } from '../../core/api/datos-extra';

import { TipoMensaje } from '../../core/api/db-enums';

export type { TipoMensaje };

import { CategoriaCliente } from '../../shared/models/cliente-categoria.model';

/** Ticks estilo WhatsApp — solo tiene sentido en mensajes SALIENTE. */
export type EstadoEnvioMensaje = 'ENVIADO' | 'ENTREGADO' | 'LEIDO' | 'FALLIDO';

/** Tipo de contenido del mensaje. */
/** Respuestas de GET /conversaciones y GET /conversaciones/:id. */
export interface MensajeApi {
  readonly id: string;
  readonly direccion: 'ENTRANTE' | 'SALIENTE';
  readonly contenido: string;
  readonly createdAt: string;
  readonly estadoEnvio?: EstadoEnvioMensaje | null;
  /** true = lo mandó el sistema (acuse fuera de horario), no una persona. */
  readonly automatico?: boolean;
  readonly tipo?: TipoMensaje;
  /** Clave interna del archivo en R2 (e.g. `wa/<convId>/<msgId>`); la usa el proxy de descarga. */
  readonly mediaKey?: string | null;
  /** URL firmada (15 min) del archivo en R2; null mientras se descarga o si es solo texto. */
  readonly mediaUrl?: string | null;
  readonly mediaMime?: string | null;
  readonly mediaNombre?: string | null;
}

export interface ConversacionResumen {
  readonly id: string;
  readonly cliente: {
    id: string;
    nombre: string;
    telefono: string;
    email: string | null;
    categoria: CategoriaCliente;
    /* Columnas reales del paciente; solo llegan en el detalle, no en el listado. */
    pac?: string | null;
    fechaNacimiento?: string | null;
    ocupacion?: string | null;
    empresaTrabajo?: string | null;
    ciLugar?: string | null;
    datosExtra?: DatosExtra | null;
    intereses?: readonly { id: string; descripcion: string }[];
  };
  readonly agente: { id: string; nombre: string } | null;
  /** El listado incluye solo el último mensaje (take: 1, desc). */
  readonly mensajes: readonly MensajeApi[];
  /** No leídos del paciente. El backend ya lo expone así; `_count` no viaja. */
  readonly noLeidosCount?: number;
  readonly updatedAt: string;
  /**
   * Lo dice el servidor, no se deduce aquí: es la columna
   * `Conversacion.esperandoRespuesta`, que existe para que la pestaña "Sin
   * responder" se pueda filtrar y contar en SQL sobre TODAS las conversaciones
   * y no solo sobre las que el navegador tenga cargadas.
   */
  readonly esperandoRespuesta?: boolean;
}

export interface ConversacionDetalle extends Omit<ConversacionResumen, 'mensajes'> {
  /** El detalle incluye el hilo completo en orden cronológico. */
  readonly mensajes: readonly MensajeApi[];
}

/** Agente para dropdown de asignación (GET /conversaciones/meta/agentes). */
export interface AgenteResumen {
  readonly id: string;
  readonly nombre: string;
  readonly rol: 'SUPER_ADMIN' | 'ADMIN' | 'AGENTE';
}

/** Plantilla de WhatsApp aprobada (GET /conversaciones/meta/plantillas). */
export interface PlantillaResumen {
  readonly nombre: string;
  readonly idioma: string;
  readonly categoria: string;
  /** Cuerpo con placeholders `{{1}}`, `{{2}}`… para previsualizar y contar variables. */
  readonly cuerpo: string;
  readonly variables: number;
}

/** Respuesta Rápida / Plantilla Personalizada del Agente (GET/POST /plantillas-agente). */
export interface PlantillaAgente {
  readonly id: string;
  readonly usuarioId: string;
  readonly titulo: string;
  readonly atajo: string | null;
  readonly contenido: string;
  readonly tags: readonly string[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** Filtros de la vista del inbox. */
export type FiltroInbox = 'TODAS' | 'SIN_RESPONDER' | 'SIN_ASIGNAR' | 'MIS_CHATS';

/** Los números de las cuatro pestañas, calculados por el servidor. */
export interface ContadoresInbox {
  readonly total: number;
  readonly sinAsignar: number;
  readonly misChats: number;
  readonly sinResponder: number;
}

/** Filtros de vista que viajan al servidor con cada petición del listado. */
export interface FiltrosInbox {
  readonly tab: FiltroInbox;
  readonly busqueda: string;
  readonly agenteId: string | null;
  readonly soloMios: boolean;
}

/** Lo que responde `GET /conversaciones`: una página más los contadores. */
export interface PaginaInbox {
  readonly datos: readonly ConversacionResumen[];
  readonly total: number;
  readonly pagina: number;
  readonly limite: number;
  readonly totalPaginas: number;
  readonly contadores: ContadoresInbox;
}

/** Lo que responde `GET /conversaciones/:id/resumen`. */
export interface ResumenInbox {
  /** `null` si la conversación dejó de encajar en la vista activa. */
  readonly conversacion: ConversacionResumen | null;
  readonly contadores: ContadoresInbox;
}

/**
 * Una conversación está sin responder si el ÚLTIMO mensaje lo escribió el
 * paciente: si nadie contestó después, sigue esperando.
 *
 * **El servidor ya manda esto en `esperandoRespuesta`** y esa es la fuente de
 * verdad —es lo que filtra y cuenta la pestaña—; esta función solo lo deduce
 * del último mensaje cuando el campo no viene, que es el caso de una fila
 * construida en memoria por el envío optimista antes de que el servidor
 * conteste.
 */
export function estaSinResponder(c: ConversacionResumen): boolean {
  if (c.esperandoRespuesta !== undefined) return c.esperandoRespuesta;

  const ultimo = c.mensajes[0];
  if (!ultimo) return false;
  /* Un acuse automático NO es una respuesta: si lo último que pasó es que el
     sistema dijo "estamos cerrados", el paciente sigue esperando a una persona.
     Sin esta línea, todo lo que entra un fin de semana desaparecería de la
     pestaña y el lunes nadie sabría quién escribió. */
  return ultimo.direccion === 'ENTRANTE' || ultimo.automatico === true;
}

/** Momento en que el paciente quedó esperando, o null si ya se le respondió. */
export function esperandoDesde(c: ConversacionResumen): Date | null {
  /* Si lo último es el acuse, su hora sirve igual: sale segundos después del
     mensaje del paciente, así que la espera que se muestra no se desvía. */
  return estaSinResponder(c) ? new Date(c.mensajes[0].createdAt) : null;
}

/** Elemento del hilo: mensaje real o separador de fecha. */
export type ItemHilo =
  | { readonly tipo: 'separador-fecha'; readonly fecha: string }
  | { readonly tipo: 'mensaje'; readonly mensaje: MensajeApi };

