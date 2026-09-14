import { inject, Injectable, signal } from '@angular/core';

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

  private readonly mutaciones = signal(0);

  /**
   * Sube en CADA mutación de actividades, venga de donde venga. Quien muestre
   * actividades se suscribe y recarga; así no hace falta que cada sitio sepa
   * quién más las está pintando.
   *
   * **La cicatriz:** la campana del layout y la página de Actividades tenían
   * cada una su propio `httpResource` del mismo `/actividades/resumen`. La
   * página recargaba los suyos tras mutar, pero nada avisaba a la campana, así
   * que completar una actividad dejaba el badge con el número viejo hasta el
   * respaldo de 60 s — y la agente, que es más rápida que eso, recargaba la
   * página. Lo mismo con «Actividad Rápida» desde el chat, que creaba una
   * actividad sin que la campana se enterara nunca.
   *
   * Solo sube si la petición salió bien: un fallo no invalida nada.
   */
  readonly cambios = this.mutaciones.asReadonly();

  private async tras<T>(operacion: Promise<T>): Promise<T> {
    const resultado = await operacion;
    this.mutaciones.update(n => n + 1);
    return resultado;
  }

  listarRequest(filtro: FiltroActividades = {}): ResourceRequest {
    return this.api.request('/actividades', { ...filtro });
  }

  resumenRequest(filtro: FiltroActividades = {}): ResourceRequest {
    return this.api.request('/actividades/resumen', { ...filtro });
  }

  /** Lista de agentes activos para filtros de ADMIN. */
  agentesRequest(): ResourceRequest {
    return this.api.request('/conversaciones/meta/agentes');
  }

  /** Detalle puntual — lo usa la campana de notificaciones al recibir un aviso por socket. */
  obtener(id: string): Promise<Actividad> {
    return this.api.get<Actividad>(`/actividades/${id}`);
  }

  crear(dto: CrearActividadDto): Promise<Actividad> {
    return this.tras(this.api.post<Actividad>('/actividades', dto));
  }

  actualizar(id: string, cambios: ActualizarActividadDto): Promise<Actividad> {
    return this.tras(this.api.patch<Actividad>(`/actividades/${id}`, cambios));
  }

  actualizarEstado(id: string, estado: EstadoActividad, notas?: string): Promise<Actividad> {
    return this.tras(
      this.api.patch<Actividad>(`/actividades/${id}/estado`, { estado, notas: notas?.trim() || undefined }),
    );
  }

  eliminar(id: string): Promise<{ ok: boolean }> {
    return this.tras(this.api.delete<{ ok: boolean }>(`/actividades/${id}`));
  }
}
