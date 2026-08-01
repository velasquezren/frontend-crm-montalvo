import { BadgeVariant } from '../components/badge/badge.component';
import { EstadoComision, EstadoLead, EstadoVenta } from '../../core/api/db-types';

export type { EstadoComision, EstadoLead, EstadoVenta };

/* ── Leads ─────────────────────────────────────────────────────── */
export const ESTADO_LEAD_LABEL: Record<EstadoLead, string> = {
  NUEVO: 'Nuevo',
  CONTACTADO: 'Contactado',
  CONVERTIDO: 'Convertido',
  PERDIDO: 'Perdido',
};

export const ESTADO_LEAD_BADGE: Record<EstadoLead, BadgeVariant> = {
  NUEVO: 'info',
  CONTACTADO: 'neutral',
  CONVERTIDO: 'success',
  PERDIDO: 'critical',
};

/* ── Ventas ────────────────────────────────────────────────────── */
export const ESTADO_VENTA_LABEL: Record<EstadoVenta, string> = {
  GANADA: 'Ganada',
  EN_PROCESO: 'En proceso',
  PERDIDA: 'Perdida',
};

export const ESTADO_VENTA_BADGE: Record<EstadoVenta, BadgeVariant> = {
  GANADA: 'success',
  EN_PROCESO: 'info',
  PERDIDA: 'critical',
};

/* ── Comisiones ────────────────────────────────────────────────── */
export const ESTADO_COMISION_LABEL: Record<EstadoComision, string> = {
  PENDIENTE: 'Pendiente',
  PAGADA: 'Pagada',
};

export const ESTADO_COMISION_BADGE: Record<EstadoComision, BadgeVariant> = {
  PENDIENTE: 'info',
  PAGADA: 'success',
};
