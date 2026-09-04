import { EstadoActividad, TipoActividad } from '../../core/api/db-enums';
import { IconName } from '../../shared/components/icon/icon.component';

export type { EstadoActividad, TipoActividad };

export const TIPO_ACTIVIDAD_LABEL: Record<TipoActividad, string> = {
  LLAMADA: 'Llamada',
  REUNION: 'Reunión',
  TAREA: 'Tarea',
  RECORDATORIO: 'Recordatorio',
};

/** Íconos ya existentes en el catálogo cerrado — ninguno nuevo por tipo. */
export const TIPO_ACTIVIDAD_ICONO: Record<TipoActividad, IconName> = {
  LLAMADA: 'phone',
  REUNION: 'users',
  TAREA: 'check-circle',
  RECORDATORIO: 'clock',
};

/**
 * Duración sugerida al crear — una llamada no es una reunión. Es un punto de
 * partida editable, no una regla: el backend acepta cualquier valor entre
 * 5 y 480 minutos (`CreateActividadDto`). Determina el alto real del bloque
 * en las vistas de semana/día del calendario.
 */
export const TIPO_ACTIVIDAD_DURACION_SUGERIDA: Record<TipoActividad, number> = {
  LLAMADA: 15,
  REUNION: 60,
  TAREA: 30,
  RECORDATORIO: 5,
};

export type FrecuenciaRepeticion = 'SEMANAL' | 'QUINCENAL' | 'MENSUAL';

export const FRECUENCIA_LABEL: Record<FrecuenciaRepeticion, string> = {
  SEMANAL: 'Cada semana',
  QUINCENAL: 'Cada 2 semanas',
  MENSUAL: 'Cada mes',
};

export const ESTADO_ACTIVIDAD_LABEL: Record<EstadoActividad, string> = {
  PENDIENTE: 'Pendiente',
  COMPLETADA: 'Completada',
  CANCELADA: 'Cancelada',
};

/** Respuesta de GET /actividades. */
export interface Actividad {
  readonly id: string;
  readonly tipo: TipoActividad;
  readonly titulo: string;
  readonly notas: string | null;
  readonly fechaProgramada: string;
  readonly duracionMinutos: number;
  readonly estado: EstadoActividad;
  readonly cliente: { readonly id: string; readonly nombre: string; readonly telefono: string };
  readonly lead: { readonly id: string; readonly estado: string; readonly origen: string } | null;
  readonly agente: { readonly id: string; readonly nombre: string };
  readonly completadaEn: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ResumenActividades {
  readonly vencidas: number;
  readonly hoy: number;
  readonly proximaSemana: number;
}

/**
 * Compartida entre `ActividadesPage` (calendario y tabla) y
 * `NotificacionesBellComponent` (panel de la campana) — una sola definición
 * de "vencida" para que las dos vistas coincidan siempre.
 */
export function esActividadVencida(a: Pick<Actividad, 'estado' | 'fechaProgramada'>): boolean {
  return a.estado === 'PENDIENTE' && new Date(a.fechaProgramada).getTime() < Date.now();
}
