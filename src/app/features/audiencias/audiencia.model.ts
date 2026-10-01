import { RespuestaPaginada, paginaVacia } from '../../core/api/pagination.model';
import { CategoriaCliente } from '../../shared/models/cliente-categoria.model';

/**
 * Audiencias: a quién mandarle una campaña HOY. Espejo de
 * `GET /audiencias` (`modules/audiencias` del backend), que decide todo: aquí
 * solo se pinta y se estima el costo.
 */

/** Por qué una paciente de las categorías elegidas quedó fuera, en el orden en que se aplica. */
export type MotivoExclusion = 'BAJA_PROMOCIONES' | 'SIN_CELULAR' | 'CAMPANA_RECIENTE' | 'SIN_CONVERSAR';

export interface PacienteDeAudiencia {
  readonly id: string;
  readonly nombre: string;
  readonly telefono: string;
  readonly pac: string | null;
  readonly categoria: CategoriaCliente;
  /** Dólares gastados en los últimos 12 meses (FileMaker + CRM). */
  readonly gastoRecienteUsd: number;
  readonly ultimaCompra: string | null;
  /** Nos escribió alguna vez por WhatsApp. */
  readonly converso: boolean;
  /** El último mensaje que le mandamos lo leyó; `null` si nunca le escribimos. */
  readonly leyoUltimo: boolean | null;
  readonly agente: { readonly id: string; readonly nombre: string } | null;
}

export interface ResumenAudiencia {
  readonly enCategorias: number;
  readonly excluidas: Readonly<Record<MotivoExclusion, number>>;
  readonly elegibles: number;
  readonly elegiblesPorCategoria: Readonly<Record<CategoriaCliente, number>>;
  readonly elegiblesQueConversaron: number;
}

export interface PaginaAudiencia extends RespuestaPaginada<PacienteDeAudiencia> {
  readonly resumen: ResumenAudiencia;
}

export interface FiltroAudiencia {
  readonly categorias: readonly CategoriaCliente[];
  readonly diasSinCampana: number;
  readonly soloConversaron: boolean;
  readonly pagina: number;
}

export function paginaAudienciaVacia(): PaginaAudiencia {
  return {
    ...paginaVacia<PacienteDeAudiencia>(),
    resumen: {
      enCategorias: 0,
      excluidas: { BAJA_PROMOCIONES: 0, SIN_CELULAR: 0, CAMPANA_RECIENTE: 0, SIN_CONVERSAR: 0 },
      elegibles: 0,
      elegiblesPorCategoria: { GOLD: 0, SILVER: 0, BRONZE: 0, PROSPECTO: 0 },
      elegiblesQueConversaron: 0,
    },
  };
}

/** Los pasos del embudo, en el orden en que el backend los aplica. */
export const MOTIVOS_EXCLUSION: readonly { readonly motivo: MotivoExclusion; readonly etiqueta: string; readonly ayuda: string }[] = [
  {
    motivo: 'BAJA_PROMOCIONES',
    etiqueta: 'Pidieron no recibir promociones',
    ayuda: 'Tocaron «No me interesa» o lo pidieron. El CRM no les manda marketing; insistir lleva a bloqueos que bajan la calidad de la línea.',
  },
  {
    motivo: 'SIN_CELULAR',
    etiqueta: 'Sin celular con WhatsApp',
    ayuda: 'Un fijo (muchos vienen de FileMaker) o un número de EE. UU. o Canadá, adonde Meta no entrega marketing.',
  },
  {
    motivo: 'CAMPANA_RECIENTE',
    etiqueta: 'Recibieron una campaña hace poco',
    ayuda: 'Meta limita cuántas plantillas de marketing recibe cada persona; repetirlas pronto no llega (error 131049) y cansa.',
  },
  {
    motivo: 'SIN_CONVERSAR',
    etiqueta: 'Nunca nos escribieron',
    ayuda: 'Solo cuenta si se pide «solo quienes ya conversaron».',
  },
];

/** Plazos para «sin campaña reciente». `0` no deja fuera a nadie por eso. */
export const PLAZOS_SIN_CAMPANA: readonly { readonly dias: number; readonly etiqueta: string }[] = [
  { dias: 7, etiqueta: 'Sin campaña en 7 días' },
  { dias: 15, etiqueta: 'Sin campaña en 15 días' },
  { dias: 30, etiqueta: 'Sin campaña en 30 días' },
  { dias: 60, etiqueta: 'Sin campaña en 60 días' },
  { dias: 90, etiqueta: 'Sin campaña en 90 días' },
  { dias: 0, etiqueta: 'Aunque hayan recibido una' },
];

/**
 * Tarifa de partida, en dólares por plantilla de Marketing ENTREGADA a un
 * número de Bolivia («Resto de Latinoamérica»). Es la de `META_COSTOS.md`
 * (septiembre de 2026), aproximada: Meta publica el valor exacto en un Excel
 * y puede cambiarlo cada trimestre. Por eso en pantalla es editable y no se
 * presenta como dato.
 */
export const TARIFA_MARKETING_REFERENCIA_USD = 0.055;

/**
 * Lo que costaría como MÁXIMO mandarle a todas las elegibles: Meta cobra por
 * mensaje entregado, y por sus límites por persona no se entregan todos.
 */
export function costoMaximoUsd(elegibles: number, tarifaUsd: number): number {
  if (!Number.isFinite(tarifaUsd) || tarifaUsd < 0) return 0;
  return Math.round(elegibles * tarifaUsd * 100) / 100;
}
