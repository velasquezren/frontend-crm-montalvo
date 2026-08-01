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
  readonly tipo?: TipoMensaje;
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
  readonly rol: 'ADMIN' | 'AGENTE';
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
export type FiltroInbox = 'TODAS' | 'SIN_ASIGNAR' | 'MIS_CHATS';
