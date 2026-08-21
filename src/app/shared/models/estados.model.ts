import { BadgeVariant } from '../components/badge/badge.component';
import { EstadoLead, EstadoVenta } from '../../core/api/db-enums';

export type { EstadoLead, EstadoVenta };

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
