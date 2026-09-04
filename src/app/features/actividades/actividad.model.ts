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
