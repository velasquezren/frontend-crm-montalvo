import { CategoriaCliente } from '../../shared/models/cliente-categoria.model';

/** Ticks estilo WhatsApp — solo tiene sentido en mensajes SALIENTE. */
export type EstadoEnvioMensaje = 'ENVIADO' | 'ENTREGADO' | 'LEIDO' | 'FALLIDO';

/** Respuestas de GET /conversaciones y GET /conversaciones/:id. */
export interface MensajeApi {
  readonly id: string;
  readonly direccion: 'ENTRANTE' | 'SALIENTE';
  readonly contenido: string;
  readonly createdAt: string;
  readonly estadoEnvio?: EstadoEnvioMensaje | null;
}

export interface ConversacionResumen {
  readonly id: string;
  readonly cliente: {
    id: string;
    nombre: string;
    telefono: string;
    email: string | null;
    categoria: CategoriaCliente;
    datosExtra?: {
      empresa?: string;
      notas?: string;
      tags?: string[];
    } | null;
  };
  readonly agente: { id: string; nombre: string } | null;
  /** El listado incluye solo el último mensaje (take: 1, desc). */
  readonly mensajes: readonly MensajeApi[];
  readonly _count: { mensajes: number };
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
  readonly rol: 'ADMIN' | 'AGENTE';
}

/** Filtros de la vista del inbox. */
export type FiltroInbox = 'TODAS' | 'SIN_ASIGNAR' | 'MIS_CHATS';
