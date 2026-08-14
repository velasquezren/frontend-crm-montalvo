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
  readonly _count: { mensajes: number };
  readonly noLeidosCount?: number;
  readonly updatedAt: string;
}

export interface ConversacionDetalle extends Omit<ConversacionResumen, 'mensajes' | '_count'> {
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

/**
 * Una conversación está sin responder si el ÚLTIMO mensaje lo escribió el
 * paciente: si nadie contestó después, sigue esperando.
 *
 * Se resuelve con lo que el listado ya trae —el backend incluye el último
 * mensaje de cada conversación (`take: 1`)—, así que no cuesta ni una consulta
 * ni un byte extra.
 */
export function estaSinResponder(c: ConversacionResumen): boolean {
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

