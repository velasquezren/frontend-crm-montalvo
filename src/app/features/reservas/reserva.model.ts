import { EstadoReservaChat } from '../../core/api/db-enums';
import { Temporal } from 'temporal-polyfill';

import { RespuestaPaginada } from '../../core/api/pagination.model';
import { BadgeVariant } from '../../shared/components/badge/badge.component';
import { ZONA_CLINICA } from '../../core/fechas/zona-clinica';

/*
 * Las reservas de la agenda de la clínica (ScriptCase), tal como las devuelve
 * `GET /agenda/reservas` del backend. Son TODAS: las hechas en la web y las de
 * ScriptCase escriben igual y no se distinguen. El CRM solo las lee: se crean,
 * se cobran y se confirman donde siempre.
 */

/** Los estados que la agenda usa hoy. Uno nuevo se muestra tal cual, sin filtro propio. */
export type EstadoReserva = 'PENDIENTE' | 'PAGADO' | 'ATENDIDO';

export interface ReservaAgenda {
  /** El número de la reserva en la agenda (`para_age`). */
  id: number;
  /** «2026-10-13», día de la clínica. */
  fecha: string;
  /** «09:30». */
  hora: string;
  medicoId: number | null;
  medico: string;
  especialidad: string | null;
  paciente: string;
  /** Como lo escribió quien reservó. */
  telefono: string | null;
  /** E.164 si ese teléfono es válido: con él se abre su chat. */
  telefonoE164: string | null;
  ci: string | null;
  observaciones: string | null;
  estado: string;
  precio: { importeCentavos: number; moneda: 'BOB' } | null;
  nit: string | null;
  razonSocial: string | null;
  tieneComprobante: boolean;
  registradaEl: string | null;
  registradaA: string | null;
  pagoChat?: { estado: EstadoReservaChat; detalle: string | null };
}

export interface PaginaReservas extends RespuestaPaginada<ReservaAgenda> {
  /** Cuántas hay de cada estado en el rango (sin búsqueda ni filtro de estado): los chips. */
  porEstado: Record<string, number>;
  /** El rango que aplicó el servidor. */
  desde: string;
  hasta: string;
}

/**
 * Lo que cada estado significa para quien lo lee, comprobado en el binlog de la
 * agenda (4/6–7/10/2026):
 * - PENDIENTE: recién reservada; recepción todavía no la gestionó.
 * - PAGADO no es «pagada»: la paciente subió un comprobante y caja tiene que verificarlo.
 * - ATENDIDO no es «la paciente fue atendida»: recepción ya la pasó a la agenda de
 *   FileMaker. 17 de 23 veces se marcó ANTES de la hora de la cita.
 */
export const ESTADO_RESERVA: Readonly<Record<EstadoReserva, { etiqueta: string; variante: BadgeVariant }>> = {
  PENDIENTE: { etiqueta: 'Por confirmar', variante: 'neutral' },
  PAGADO: { etiqueta: 'Pago por verificar', variante: 'info' },
  ATENDIDO: { etiqueta: 'Gestionada', variante: 'success' },
};

export const ESTADOS_FILTRO: readonly EstadoReserva[] = ['PENDIENTE', 'PAGADO', 'ATENDIDO'];

/** Etiqueta y variante de un estado, también de uno que la agenda empiece a usar mañana. */
export function estadoDeReserva(estado: string): { etiqueta: string; variante: BadgeVariant } {
  return estado in ESTADO_RESERVA
    ? ESTADO_RESERVA[estado as EstadoReserva]
    : { etiqueta: estado || 'Sin estado', variante: 'neutral' };
}

export type PeriodoReservas = 'hoy' | 'semana' | 'mes' | 'pasados';

export const PERIODOS: readonly { id: PeriodoReservas; etiqueta: string }[] = [
  { id: 'hoy', etiqueta: 'Hoy' },
  { id: 'semana', etiqueta: 'Próximos 7 días' },
  { id: 'mes', etiqueta: 'Próximos 30 días' },
  { id: 'pasados', etiqueta: 'Últimos 30 días' },
];

/**
 * El rango de un periodo en el calendario de La Paz, como lo espera el backend
 * («2026-10-13»). Con Temporal y la zona de la clínica: a las 21:00 de Bolivia
 * el navegador de una agente con la hora de otro país no adelanta el día.
 */
export function rangoDePeriodo(periodo: PeriodoReservas, ahora = new Date()): { desde: string; hasta: string } {
  const hoy = Temporal.Instant.fromEpochMilliseconds(ahora.getTime()).toZonedDateTimeISO(ZONA_CLINICA).toPlainDate();
  const dia = (n: number) => hoy.add({ days: n }).toString();
  switch (periodo) {
    case 'hoy': return { desde: dia(0), hasta: dia(0) };
    case 'semana': return { desde: dia(0), hasta: dia(6) };
    case 'mes': return { desde: dia(0), hasta: dia(29) };
    case 'pasados': return { desde: dia(-29), hasta: dia(0) };
  }
}

const DIAS = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** «2026-10-13» → «mar 13 oct»: el día de la semana es lo primero que pregunta quien llama. */
export function fechaDeReserva(fecha: string): string {
  try {
    const d = Temporal.PlainDate.from(fecha);
    return `${DIAS[d.dayOfWeek - 1]} ${d.day} ${MESES[d.month - 1]}`;
  } catch {
    return fecha || '—';
  }
}

/** El precio de la agenda (centavos) en Bs para el pipe `moneda`. */
export function precioEnBs(precio: ReservaAgenda['precio']): number | null {
  return precio ? precio.importeCentavos / 100 : null;
}
