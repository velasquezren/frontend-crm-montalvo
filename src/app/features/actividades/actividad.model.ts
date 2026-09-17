import { EstadoActividad, FrecuenciaRepeticion, TipoActividad } from '../../core/api/db-enums';
import { BadgeVariant } from '../../shared/components/badge/badge.component';
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

/**
 * Reexportada desde los enums generados, no escrita a mano.
 *
 * Desde A5.1 la cadencia es un enum de `schema.prisma`, así que el backend y
 * esta pantalla comparten UNA definición y `check:tipos` la vigila. Antes
 * estaba escrita dos veces, una en cada runtime, sin nada que avisara si
 * divergían.
 */
export type { FrecuenciaRepeticion };

export const FRECUENCIA_LABEL: Record<FrecuenciaRepeticion, string> = {
  SEMANAL: 'Cada semana',
  QUINCENAL: 'Cada 2 semanas',
  MENSUAL: 'Cada mes',
};

/**
 * Cómo se NOMBRA una repetición ya existente, que no es cómo se ELIGE al crear.
 *
 * `FRECUENCIA_LABEL` responde «cada cuánto la agendo» y vive en los chips del
 * formulario; esto responde «qué es esta actividad» y vive en la lista y en el
 * detalle. Mismo enum, dos preguntas: fundirlas daba «Cada semana» colgando de
 * una fila, que no dice que la fila PERTENEZCA a nada.
 */
export const REPETICION_LABEL: Record<FrecuenciaRepeticion, string> = {
  SEMANAL: 'Repetición semanal',
  QUINCENAL: 'Repetición quincenal',
  MENSUAL: 'Repetición mensual',
};

/**
 * La etiqueta de repetición, o `null` si no hay nada que etiquetar.
 *
 * Exige los DOS campos. El backend los escribe juntos y nunca por separado
 * (`create` de `actividades.service.ts`), pero la interfaz no promete una
 * cadencia que no puede nombrar: sin `frecuenciaSerie` no hay etiqueta.
 */
export function etiquetaRepeticion(
  a: Pick<Actividad, 'serieId' | 'frecuenciaSerie'>,
): string | null {
  return a.serieId && a.frecuenciaSerie ? REPETICION_LABEL[a.frecuenciaSerie] : null;
}

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
  readonly cliente: { readonly id: string; readonly nombre: string; readonly telefono: string; readonly pac?: string | null };
  readonly lead: { readonly id: string; readonly estado: string; readonly origen: string } | null;
  readonly agente: { readonly id: string; readonly nombre: string };
  readonly completadaEn: string | null;
  /**
   * A qué repetición pertenece, o `null` si es una actividad suelta.
   *
   * Las creadas ANTES de A5.1 lo tienen a `null` aunque se agendaran con
   * «repetir»: entonces no se guardaba nada que las enlazara. Son individuales
   * y la interfaz las trata como tales; no hay hermanas que buscar.
   */
  readonly serieId: string | null;
  readonly frecuenciaSerie: FrecuenciaRepeticion | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ResumenActividades {
  readonly vencidas: number;
  readonly hoy: number;
  readonly proximaSemana: number;
  readonly completadas?: number;
}

/**
 * Compartida entre `ActividadesPage` (calendario y tabla) y
 * `NotificacionesBellComponent` (panel de la campana) — una sola definición
 * de "vencida" para que las dos vistas coincidan siempre.
 */
export function esActividadVencida(a: Pick<Actividad, 'estado' | 'fechaProgramada'>): boolean {
  return a.estado === 'PENDIENTE' && new Date(a.fechaProgramada).getTime() < Date.now();
}

/**
 * Retorna una etiqueta amigable y relativa para entender al instante la urgencia:
 * "Vencida hace 2 h", "Hoy 15:30", "Mañana 09:00", o "12 Sep 10:00".
 */
export function formatoFechaRelativa(fechaIso: string): { texto: string; urgente: boolean } {
  const fecha = new Date(fechaIso);
  const ahora = new Date();
  const diffMs = fecha.getTime() - ahora.getTime();
  const diffMin = Math.round(diffMs / (60 * 1000));
  const diffHoras = Math.round(diffMs / (60 * 60 * 1000));
  const diffDias = Math.round(diffMs / (24 * 60 * 60 * 1000));

  const pad = (n: number) => String(n).padStart(2, '0');
  const horaStr = `${pad(fecha.getHours())}:${pad(fecha.getMinutes())}`;

  if (diffMs < 0) {
    const minsAtras = Math.abs(diffMin);
    const horasAtras = Math.abs(diffHoras);
    const diasAtras = Math.abs(diffDias);

    if (minsAtras < 60) return { texto: `Vencida hace ${minsAtras} min`, urgente: true };
    if (horasAtras < 24) return { texto: `Vencida hace ${horasAtras} h`, urgente: true };
    return { texto: `Vencida hace ${diasAtras} d`, urgente: true };
  }

  const esHoy = fecha.toDateString() === ahora.toDateString();
  if (esHoy) {
    if (diffMin <= 30) return { texto: `En ${diffMin} min (${horaStr})`, urgente: true };
    return { texto: `Hoy ${horaStr}`, urgente: false };
  }

  const manana = new Date(ahora);
  manana.setDate(manana.getDate() + 1);
  if (fecha.toDateString() === manana.toDateString()) {
    return { texto: `Mañana ${horaStr}`, urgente: false };
  }

  const dia = fecha.getDate();
  const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  return { texto: `${dia} ${meses[fecha.getMonth()]} · ${horaStr}`, urgente: false };
}

/**
 * «45 min», «1 h», «1 h 30». Lo usan la lista, el detalle y el formulario.
 *
 * Vive aquí y no en un componente porque lo consultan los tres: tenerlo en uno
 * y copiarlo en otro es cómo se llega a dos formatos distintos para el mismo
 * número.
 */
export function formatearDuracion(minutos: number): string {
  if (minutos < 60) return `${minutos} min`;
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  return resto === 0 ? `${horas} h` : `${horas} h ${resto}`;
}

/** Con qué color se pinta cada estado. Lo miran la lista y el detalle. */
export const ESTADO_BADGE: Record<EstadoActividad, BadgeVariant> = {
  PENDIENTE: 'info',
  COMPLETADA: 'success',
  CANCELADA: 'neutral',
};
