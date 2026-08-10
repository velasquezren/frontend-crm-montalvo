import { inject, Injectable } from '@angular/core';

import { ApiService, ResourceRequest } from '../../core/api/api.service';
import { ConversacionDetalle, MensajeApi } from './conversacion.model';

/**
 * Conversaciones — WhatsApp Inbox (RF-09/RF-10).
 * El envío real por WhatsApp Cloud API lo hace el backend; aquí solo
 * se persiste/consulta. La visibilidad por rol la resuelve el servidor.
 */
const MAX_CACHE_CONVERSACIONES = 50;

@Injectable({ providedIn: 'root' })
export class ConversacionesService {
  private readonly api = inject(ApiService);
  private readonly cacheDetalles = new Map<string, ConversacionDetalle>();

  listarRequest(soloMios = false): ResourceRequest {
    return this.api.request('/conversaciones', { soloMios: soloMios ? 'true' : undefined });
  }

  detalleRequest(id: string): ResourceRequest {
    return this.api.request(`/conversaciones/${id}`);
  }

  /** Devuelve la versión en caché inmediata del mapa de la sesión, o null si no existe. */
  getCachedDetalle(id: string): ConversacionDetalle | null {
    const item = this.cacheDetalles.get(id);
    if (item) {
      // Re-insertar para marcar como más recientemente usado (LRU)
      this.cacheDetalles.delete(id);
      this.cacheDetalles.set(id, item);
      return item;
    }
    return null;
  }

  /** Guarda o actualiza una entrada en el caché aplicando limite LRU (máximo 50 chats). */
  setCachedDetalle(id: string, detalle: ConversacionDetalle): void {
    if (this.cacheDetalles.has(id)) {
      this.cacheDetalles.delete(id);
    } else if (this.cacheDetalles.size >= MAX_CACHE_CONVERSACIONES) {
      // Eliminar la entrada más antigua del Map
      const oldestKey = this.cacheDetalles.keys().next().value;
      if (oldestKey) {
        this.cacheDetalles.delete(oldestKey);
      }
    }
    this.cacheDetalles.set(id, detalle);
  }

  /**
   * Actualiza en segundo plano el caché solo de las conversaciones que YA estaban
   * abiertas en esta sesión. Si nunca se abrió, no hace nada (sin peticiones vacías).
   */
  async actualizarCachePorRealtime(conversacionId: string): Promise<ConversacionDetalle | null> {
    if (!this.cacheDetalles.has(conversacionId)) {
      return null;
    }
    try {
      const detalle = await this.api.get<ConversacionDetalle>(`/conversaciones/${conversacionId}`);
      if (detalle) {
        this.setCachedDetalle(conversacionId, detalle);
      }
      return detalle;
    } catch {
      return null;
    }
  }

  /** Paginación por cursor para mensajes antiguos (scroll hacia arriba). */
  obtenerMensajesAnteriores(id: string, antesDe: string, limit = 50): Promise<MensajeApi[]> {
    return this.api.get<MensajeApi[]>(`/conversaciones/${id}/mensajes-anteriores`, { antesDe, limit });
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
  enviarMensaje(
    conversacionId: string,
    contenido: string,
    adjunto?: { mediaKey: string; mediaMime: string | null; mediaNombre: string | null },
  ): Promise<MensajeApi> {
    return this.api.post<MensajeApi>(`/conversaciones/${conversacionId}/mensajes`, {
      contenido,
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
  plantillasRequest(): ResourceRequest {
    return this.api.request('/conversaciones/meta/plantillas');
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
