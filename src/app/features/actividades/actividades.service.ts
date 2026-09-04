import { inject, Injectable } from '@angular/core';

import { ApiService, ResourceRequest } from '../../core/api/api.service';
import { Actividad, EstadoActividad, FrecuenciaRepeticion, TipoActividad } from './actividad.model';

/**
 * Repetir al crear: `veces` filas independientes (2-12), sin serie enlazada
 * — ver el DTO homónimo del backend (`RepetirActividadDto`) para el porqué.
 */
export interface RepetirActividadDto {
  frecuencia: FrecuenciaRepeticion;
  veces: number;
}

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
  /** Minutos; si se omite, el backend guarda 30. */
  duracionMinutos?: number;
  clienteId: string;
  leadId?: string;
  /** Solo tiene efecto si quien llama es ADMIN+. */
  agenteId?: string;
  /** Solo al crear — genera filas adicionales independientes. */
  repetir?: RepetirActividadDto;
}

export interface ActualizarActividadDto {
  tipo?: TipoActividad;
  titulo?: string;
  notas?: string;
  fechaProgramada?: string;
  duracionMinutos?: number;
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

  /** Detalle puntual — lo usa la campana de notificaciones al recibir un aviso por socket. */
  obtener(id: string): Promise<Actividad> {
    return this.api.get<Actividad>(`/actividades/${id}`);
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
