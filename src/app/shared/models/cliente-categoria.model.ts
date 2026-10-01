import { BadgeVariant } from '../components/badge/badge.component';
import { CategoriaCliente } from '../../core/api/db-enums';
import { ZONA_CLINICA } from '../../features/actividades/zona-clinica';

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

/** Mapeo a variantes del átomo Badge. Gold lleva el latón, su único uso. */
export const CATEGORIA_BADGE: Record<CategoriaCliente, BadgeVariant> = {
  GOLD: 'gold',
  SILVER: 'info',
  BRONZE: 'neutral',
  PROSPECTO: 'neutral',
};

/** Lo que responde `PUT /clientes/:id/categoria`. */
export interface EstadoCategoria {
  readonly id: string;
  readonly categoria: CategoriaCliente;
  readonly categoriaFijadaEn: string | null;
  readonly categoriaFijadaPor: { readonly id: string; readonly nombre: string } | null;
}

/**
 * De dónde sale la categoría, para el `title` del sello. La regla vive en el
 * backend (`clientes/categoria-paciente.ts`); este texto la resume y tiene que
 * decir lo mismo.
 */
export function origenDeCategoria(categoriaFijadaEn: string | null | undefined): string {
  if (categoriaFijadaEn) {
    const fecha = new Date(categoriaFijadaEn).toLocaleDateString('es-BO', { day: 'numeric', month: 'long', year: 'numeric', timeZone: ZONA_CLINICA });
    return `Fijada a mano el ${fecha}. El cálculo automático no la cambia.`;
  }
  return 'Automática: Gold desde $3.500 gastados en 12 meses, Silver desde $1.000, Bronze si compró alguna vez (FileMaker y CRM).';
}

/** Canales de origen de un cliente/lead — Ref: RF-06. */
export type OrigenCanal = 'Facebook' | 'Instagram' | 'WhatsApp' | 'Presencial';
