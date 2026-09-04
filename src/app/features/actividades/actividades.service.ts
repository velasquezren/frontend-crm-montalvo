import { inject, Injectable } from '@angular/core';

import { ApiService, ResourceRequest } from '../../core/api/api.service';
import { Actividad, EstadoActividad, TipoActividad } from './actividad.model';

export interface FiltroActividades {
  tipo?: TipoActividad;
  estado?: EstadoActividad;
  clienteId?: string;
  leadId?: string;
  agenteId?: string;
  q?: string;
  /** ISO 8601. */
  desde?: string;
  hasta?: string;
  pagina?: number;
  limite?: number;
}

export interface CrearActividadDto {
  tipo: TipoActividad;
  titulo: string;
  notas?: string;
  /** ISO 8601. */
  fechaProgramada: string;
  clienteId: string;
  leadId?: string;
  /** Solo tiene efecto si quien llama es ADMIN+. */
  agenteId?: string;
}

export interface ActualizarActividadDto {
  tipo?: TipoActividad;
  titulo?: string;
  notas?: string;
  fechaProgramada?: string;
  clienteId?: string;
  leadId?: string | null;
}

/**
 * Seguimiento comercial — recordatorios y tareas de un agente sobre un
 * Cliente/Lead. Ver `crm-feature-page`: los endpoints viven aquí, nunca en la
 * página.
 */
@Injectable({ providedIn: 'root' })
export class ActividadesService {
  private readonly api = inject(ApiService);

  listarRequest(filtro: FiltroActividades = {}): ResourceRequest {
    return this.api.request('/actividades', { ...filtro });
  }

  resumenRequest(filtro: FiltroActividades = {}): ResourceRequest {
    return this.api.request('/actividades/resumen', { ...filtro });
  }

  crear(dto: CrearActividadDto): Promise<Actividad> {
    return this.api.post<Actividad>('/actividades', dto);
  }

  actualizar(id: string, cambios: ActualizarActividadDto): Promise<Actividad> {
    return this.api.patch<Actividad>(`/actividades/${id}`, cambios);
  }

  actualizarEstado(id: string, estado: EstadoActividad): Promise<Actividad> {
    return this.api.patch<Actividad>(`/actividades/${id}/estado`, { estado });
  }

  eliminar(id: string): Promise<{ ok: boolean }> {
    return this.api.delete<{ ok: boolean }>(`/actividades/${id}`);
  }
}
