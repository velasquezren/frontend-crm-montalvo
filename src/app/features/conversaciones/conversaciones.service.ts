import { inject, Injectable } from '@angular/core';

import { ApiService, ResourceRequest } from '../../core/api/api.service';
import { ConversacionDetalle, MensajeApi } from './conversacion.model';

/**
 * Conversaciones — WhatsApp Inbox (RF-09/RF-10).
 * El envío real por WhatsApp Cloud API lo hace el backend; aquí solo
 * se persiste/consulta. La visibilidad por rol la resuelve el servidor.
 */
@Injectable({ providedIn: 'root' })
export class ConversacionesService {
  private readonly api = inject(ApiService);

  listarRequest(): ResourceRequest {
    return this.api.request('/conversaciones');
  }

  detalleRequest(id: string): ResourceRequest {
    return this.api.request(`/conversaciones/${id}`);
  }

  /** Agentes activos — alimenta el desplegable de asignación del admin. */
  agentesRequest(): ResourceRequest {
    return this.api.request('/conversaciones/meta/agentes');
  }

  enviarMensaje(conversacionId: string, contenido: string): Promise<MensajeApi> {
    return this.api.post<MensajeApi>(`/conversaciones/${conversacionId}/mensajes`, { contenido });
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
