import { validarPaginaInbox, validarResumenInbox } from './validar-canal';
import { inject, Injectable } from '@angular/core';

import { ApiService, ResourceRequest } from '../../core/api/api.service';
import {
  ConversacionDetalle,
  FiltrosInbox,
  MensajeApi,
  PaginaInbox,
  ResumenInbox,
} from './conversacion.model';

/**
 * Conversaciones — WhatsApp Inbox (RF-09/RF-10).
 * El envío real por WhatsApp Cloud API lo hace el backend; aquí solo
 * se persiste/consulta. La visibilidad por rol la resuelve el servidor.
 */


@Injectable({ providedIn: 'root' })
export class ConversacionesService {
  private readonly api = inject(ApiService);


  /**
   * Una página del inbox, con los filtros resueltos EN EL SERVIDOR.
   *
   * Antes esto pedía el listado entero (las 500 más recientes) y la vista
   * filtraba y buscaba en memoria. Una conversación fuera de ese corte no
   * aparecía al buscar a esa paciente por nombre, y la agente concluía que no
   * existía. Ver `findAll` en el backend para la historia completa.
   */
  listarRequest(filtros: FiltrosInbox, pagina = 1): ResourceRequest {
    return this.api.request('/conversaciones', {
      lineaId: filtros.lineaId ?? undefined,
      tab: filtros.tab === 'TODAS' ? undefined : filtros.tab,
      busqueda: filtros.busqueda.trim() || undefined,
      agenteId: filtros.agenteId ?? undefined,
      soloMios: filtros.soloMios ? 'true' : undefined,
      pagina: pagina > 1 ? String(pagina) : undefined,
    });
  }

  /** Una página del inbox como promesa — para el botón "cargar más". */
  async listarPagina(filtros: FiltrosInbox, pagina: number): Promise<PaginaInbox> {
    return validarPaginaInbox(await this.api.get<unknown>('/conversaciones', {
      lineaId: filtros.lineaId ?? undefined,
      tab: filtros.tab === 'TODAS' ? undefined : filtros.tab,
      busqueda: filtros.busqueda.trim() || undefined,
      agenteId: filtros.agenteId ?? undefined,
      soloMios: filtros.soloMios ? 'true' : undefined,
      pagina: String(pagina),
    }));
  }

  /**
   * Una sola fila del inbox, para refrescar por WebSocket lo que cambió.
   *
   * Los filtros viajan porque la respuesta depende de ellos: si la conversación
   * dejó de encajar en la pestaña activa, vuelve `conversacion: null` y la
   * vista la quita en vez de dejar una fila que ya no corresponde.
   */
  async resumenParaInbox(id: string, filtros: FiltrosInbox): Promise<ResumenInbox> {
    return validarResumenInbox(await this.api.get<unknown>(`/conversaciones/${id}/resumen`, {
      lineaId: filtros.lineaId ?? undefined,
      tab: filtros.tab === 'TODAS' ? undefined : filtros.tab,
      busqueda: filtros.busqueda.trim() || undefined,
      agenteId: filtros.agenteId ?? undefined,
      soloMios: filtros.soloMios ? 'true' : undefined,
    }));
  }

  detalleRequest(id: string): ResourceRequest {
    return this.api.request(`/conversaciones/${id}`);
  }

  /** Paginación por cursor para mensajes antiguos (scroll hacia arriba). */
  /**
   * `antesDeId` desempata: `createdAt` no es único.
   *
   * Los mensajes que el backend persiste en una misma transacción comparten el
   * instante exacto, y con la fecha sola una página que cortara dentro de ese
   * grupo se saltaba al resto para siempre. Ver el docblock de
   * `obtenerMensajesAnteriores` en el backend.
   */
  obtenerMensajesAnteriores(
    id: string,
    antesDe: string,
    limit = 50,
    antesDeId?: string,
  ): Promise<MensajeApi[]> {
    return this.api.get<MensajeApi[]>(`/conversaciones/${id}/mensajes-anteriores`, {
      antesDe, limit, ...(antesDeId ? { antesDeId } : {}),
    });
  }

  /** Búsqueda histórica de mensajes en el servidor. */
  buscarMensajes(id: string, query: string, limit = 20, skip = 0): Promise<{ total: number; items: MensajeApi[] }> {
    return this.api.get<{ total: number; items: MensajeApi[] }>(`/conversaciones/${id}/buscar-mensajes`, { query, limit, skip });
  }

  /** Agentes activos — alimenta el desplegable de asignación del admin. */
  agentesRequest(): ResourceRequest {
    return this.api.request('/conversaciones/meta/agentes');
  }

  /**
   * `adjunto` viaja como CLAVE de R2, no como URL. La URL que devuelve la subida
   * está firmada y caduca a los 15 minutos: guardarla en el texto hacía que la
   * burbuja se rompiera en el CRM un cuarto de hora después de enviarla.
   */
  /**
   * @param clientMessageId Identidad de la INTENCIÓN de envío, estable entre
   *   reintentos. El backend la guarda con un índice único, así que dos POST
   *   con el mismo valor producen un solo mensaje y un solo envío a Meta. Sin
   *   ella, un reintento tras una respuesta perdida manda un segundo WhatsApp.
   */
  enviarMensaje(
    conversacionId: string,
    contenido: string,
    adjunto?: { mediaKey: string; mediaMime: string | null; mediaNombre: string | null },
    clientMessageId?: string,
  ): Promise<MensajeApi> {
    return this.api.post<MensajeApi>(`/conversaciones/${conversacionId}/mensajes`, {
      contenido,
      clientMessageId,
      mediaKey: adjunto?.mediaKey,
      mediaMime: adjunto?.mediaMime ?? undefined,
      mediaNombre: adjunto?.mediaNombre ?? undefined,
    });
  }

  /** Asignar/reasignar agente — solo ADMIN (bloqueado también en el backend). */
  asignarAgente(conversacionId: string, agenteId: string | null): Promise<ConversacionDetalle> {
    return this.api.patch<ConversacionDetalle>(`/conversaciones/${conversacionId}/agente`, {
      agenteId,
    });
  }

  /** Plantillas aprobadas de la WABA — para escribirle a un paciente fuera de la ventana de 24h. */
  plantillasRequest(lineaId: string): ResourceRequest {
    return this.api.request('/conversaciones/meta/plantillas', { lineaId });
  }

  /** Envía una plantilla al paciente. `contenido` es el texto ya renderizado que se guarda. */
  enviarPlantilla(
    conversacionId: string,
    payload: { plantilla: string; idioma: string; parametros: string[]; contenido: string },
  ): Promise<MensajeApi> {
    return this.api.post<MensajeApi>(`/conversaciones/${conversacionId}/plantilla`, payload);
  }

  /** Marca como leído (tildes azules) el último entrante; `typing` muestra "escribiendo…". */
  marcarLeido(conversacionId: string, typing = false): Promise<{ ok: boolean }> {
    return this.api.post<{ ok: boolean }>(`/conversaciones/${conversacionId}/leido`, { typing });
  }

  /** Respuestas Rápidas / Plantillas Personalizadas del Agente. */
  plantillasAgenteRequest(): ResourceRequest {
    return this.api.request('/plantillas-agente');
  }

  crearPlantillaAgente(payload: { titulo: string; atajo?: string; contenido: string; tags?: string[] }) {
    return this.api.post('/plantillas-agente', payload);
  }

  actualizarPlantillaAgente(id: string, payload: Partial<{ titulo: string; atajo?: string; contenido: string; tags?: string[] }>) {
    return this.api.patch(`/plantillas-agente/${id}`, payload);
  }

  eliminarPlantillaAgente(id: string) {
    return this.api.delete(`/plantillas-agente/${id}`);
  }
}
