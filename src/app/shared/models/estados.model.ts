import { BadgeVariant } from '../components/badge/badge.component';

/**
 * Estados de negocio — espejo de los enums de schema.prisma del backend
 * (EstadoLead, EstadoVenta, EstadoComision). Ref: CRM_MANIFESTO.md §1.1 (Modelo Único).
 *
 * Cada estado se mapea a una variante del átomo Badge; ninguna vista define
 * sus propios colores ni etiquetas (§3.4 — paleta cerrada).
 */

/* ── Leads ─────────────────────────────────────────────────────── */
export type EstadoLead = 'NUEVO' | 'CONTACTADO' | 'CONVERTIDO' | 'PERDIDO';

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
export type EstadoVenta = 'GANADA' | 'EN_PROCESO' | 'PERDIDA';

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
export type EstadoComision = 'PENDIENTE' | 'PAGADA';

export const ESTADO_COMISION_LABEL: Record<EstadoComision, string> = {
  PENDIENTE: 'Pendiente',
  PAGADA: 'Pagada',
};

export const ESTADO_COMISION_BADGE: Record<EstadoComision, BadgeVariant> = {
  PENDIENTE: 'info',
  PAGADA: 'success',
};
