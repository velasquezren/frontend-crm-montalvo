import { BadgeVariant } from '../components/badge/badge.component';
import { EstadoLead, EstadoPeriodo, EstadoVenta } from '../../core/api/db-enums';

export type { EstadoLead, EstadoPeriodo, EstadoVenta };

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

/* ── Periodos de liquidación ───────────────────────────────────── */

/**
 * El ciclo de vida de un mes de comisiones. Espejo de `EstadoPeriodo` del
 * backend; las transiciones legales las decide `estados-periodo.ts` allá.
 *
 * Están acá y no maquetados en cada plantilla por la misma razón que los
 * estados de lead: la barra superior de Planilla resolvía el color con un
 * ternario anidado (`estado === 'CALCULADO' ? 'success' : ... 'info'`) que con
 * tres estados ya era difícil de leer, y con cinco habría pintado EN_REVISION y
 * PAGADO del mismo color que un borrador sin que nada avisara.
 */
export const ESTADO_PERIODO_LABEL: Record<EstadoPeriodo, string> = {
  BORRADOR: 'Borrador',
  CALCULADO: 'Calculado',
  EN_REVISION: 'En revisión',
  CERRADO: 'Cerrado',
  PAGADO: 'Pagado',
};

/**
 * `critical` es NEGRO en esta paleta, no rojo (ver `crm-design-system`): marca
 * lo que exige atención, no un error. Por eso lo lleva `EN_REVISION`, que es el
 * único estado que espera una acción de una persona concreta.
 */
export const ESTADO_PERIODO_BADGE: Record<EstadoPeriodo, BadgeVariant> = {
  BORRADOR: 'neutral',
  CALCULADO: 'info',
  EN_REVISION: 'critical',
  CERRADO: 'success',
  PAGADO: 'success',
};

/** Una frase que explica qué se puede hacer en cada estado. */
export const ESTADO_PERIODO_AYUDA: Record<EstadoPeriodo, string> = {
  BORRADOR: 'Importado y sin calcular. Se puede reimportar y corregir filas.',
  CALCULADO: 'Tiene cifras. Se pueden seguir ajustando ventas y recalculando.',
  EN_REVISION: 'Congelado mientras se revisa: no admite ajustes ni recálculo.',
  CERRADO: 'Cifras firmes. Reabrirlo exige ser SUPER_ADMIN e indicar el motivo.',
  PAGADO: 'Ya se pagó. No se modifica: un error se corrige en el mes siguiente.',
};
