import { BadgeVariant } from '../components/badge/badge.component';
import { IconName } from '../components/icon/icon.component';
import { CategoriaCliente } from '../../core/api/db-types';

export type { CategoriaCliente };

/**
 * Categorización de clientes — espejo del enum CategoriaCliente del schema.prisma
 * del backend (Prospecto/Bronze/Silver/Gold). Ref: CRM_MANIFESTO.md §1.1 (Modelo Único).
 */
export const CATEGORIA_LABEL: Record<CategoriaCliente, string> = {
  GOLD: 'Gold (VIP)',
  SILVER: 'Silver',
  BRONZE: 'Bronze',
  PROSPECTO: 'Prospecto',
};

/** Mapeo a variantes del átomo Badge. */
export const CATEGORIA_BADGE: Record<CategoriaCliente, BadgeVariant> = {
  GOLD: 'success',
  SILVER: 'info',
  BRONZE: 'neutral',
  PROSPECTO: 'neutral',
};

export const CATEGORIA_ICON: Partial<Record<CategoriaCliente, IconName>> = {
  GOLD: 'star',
  SILVER: 'check-circle',
  BRONZE: 'users',
  PROSPECTO: 'users',
};

/** Canales de origen de un cliente/lead — Ref: RF-06. */
export type OrigenCanal = 'Facebook' | 'Instagram' | 'WhatsApp' | 'Presencial';
