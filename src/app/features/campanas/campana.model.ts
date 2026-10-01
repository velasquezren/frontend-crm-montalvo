import { EstadoCampana, EstadoDestinatario, EstadoMensaje } from '../../core/api/db-enums';
import { BadgeVariant } from '../../shared/components/badge/badge.component';
import { CategoriaCliente } from '../../shared/models/cliente-categoria.model';
import { esNombreProvisional } from '../../shared/models/nombre-cliente';
import { ZONA_CLINICA } from '../actividades/zona-clinica';

/**
 * Campañas: una plantilla de Marketing a una audiencia congelada. Espejo de
 * `modules/campanas` del backend, que decide y manda; aquí se lanza, se
 * controla y se lee.
 */

export type { EstadoCampana, EstadoDestinatario };

/** De dónde sale cada variable. Espejo de `VariableCampana` (backend, `campana.ts`). */
export type VariableCampana =
  | { readonly tipo: 'NOMBRE'; readonly respaldo: string }
  | { readonly tipo: 'TEXTO'; readonly texto: string };

export interface FiltroCampana {
  readonly categorias: readonly CategoriaCliente[];
  readonly diasSinCampana: number;
  readonly soloConversaron: boolean;
}

export interface MetricasCampana {
  readonly total: number;
  readonly pendientes: number;
  readonly enviados: number;
  readonly omitidos: number;
  readonly fallidos: number;
  readonly entregados: number;
  readonly leidos: number;
  readonly rechazadosMeta: number;
  readonly limiteMeta: number;
  readonly respondieron: number;
  readonly bajas: number;
  readonly compraron: number;
  readonly ingresoUsd: number;
  readonly costoEstimadoUsd: number;
}

export interface Campana {
  readonly id: string;
  readonly nombre: string;
  readonly plantilla: string;
  readonly idioma: string;
  readonly variables: readonly VariableCampana[];
  readonly filtro: FiltroCampana;
  readonly tarifaUsd: number;
  readonly estado: EstadoCampana;
  /** Por qué la pausó el sistema; null si la pausó una persona o no está pausada. */
  readonly motivoPausa: string | null;
  readonly programadaPara: string;
  readonly createdAt: string;
  readonly terminadaEn: string | null;
  readonly linea: { readonly id: string; readonly nombre: string };
  readonly creadaPor: { readonly id: string; readonly nombre: string };
  readonly metricas: MetricasCampana;
}

export interface DestinatarioCampana {
  readonly id: string;
  readonly estado: EstadoDestinatario;
  readonly motivo: string | null;
  readonly enviadoEn: string | null;
  readonly cliente: { readonly id: string; readonly nombre: string; readonly telefono: string; readonly categoria: CategoriaCliente };
  readonly mensaje: {
    readonly estadoEnvio: EstadoMensaje | null;
    readonly codigoErrorEnvio: number | null;
    readonly entregadoEn: string | null;
    readonly leidoEn: string | null;
  } | null;
}

/** Lo que viaja a `POST /campanas`. */
export interface NuevaCampana {
  readonly nombre: string;
  readonly lineaId: string;
  readonly plantilla: string;
  readonly idioma: string;
  readonly variables: readonly VariableCampana[];
  readonly filtro: FiltroCampana;
  readonly tarifaUsd: number;
  readonly programadaPara?: string;
  /** Cuántas elegibles se vieron: si la audiencia cambió, el backend responde 409. */
  readonly elegiblesVistas: number;
}

export const ESTADO_CAMPANA: Readonly<Record<EstadoCampana, { readonly etiqueta: string; readonly variante: BadgeVariant }>> = {
  PROGRAMADA: { etiqueta: 'Programada', variante: 'info' },
  ENVIANDO: { etiqueta: 'Enviando', variante: 'success' },
  PAUSADA: { etiqueta: 'Pausada', variante: 'critical' },
  TERMINADA: { etiqueta: 'Terminada', variante: 'neutral' },
  CANCELADA: { etiqueta: 'Cancelada', variante: 'neutral' },
};

export const ESTADO_DESTINATARIO: Readonly<Record<EstadoDestinatario, string>> = {
  PENDIENTE: 'Pendiente',
  ENVIANDO: 'Enviando',
  ENVIADO: 'Enviado',
  OMITIDO: 'Omitido',
  FALLIDO: 'No se pudo enviar',
};

/** Qué se puede hacer desde cada estado. El backend lo hace cumplir; esto solo decide qué botón se ofrece. */
export function accionesDe(estado: EstadoCampana): { pausar: boolean; reanudar: boolean; cancelar: boolean } {
  return {
    pausar: estado === 'PROGRAMADA' || estado === 'ENVIANDO',
    reanudar: estado === 'PAUSADA',
    cancelar: estado === 'PROGRAMADA' || estado === 'ENVIANDO' || estado === 'PAUSADA',
  };
}

/** `parte` de `total` en porcentaje entero; null si no hay base (no es un 0 %). */
export function porcentaje(parte: number, total: number): number | null {
  return total > 0 ? Math.round((parte / total) * 100) : null;
}

/**
 * El nombre de pila para la vista previa. Espejo de `nombreDePila` del
 * backend, que es el que se usa al enviar: «WhatsApp +591…» no es un nombre.
 */
export function nombreDePila(nombre: string): string | null {
  if (esNombreProvisional(nombre)) return null;
  const primero = nombre.trim().split(/\s+/)[0] ?? '';
  if (!primero) return null;
  return primero.charAt(0).toLocaleUpperCase('es') + primero.slice(1).toLocaleLowerCase('es');
}

/** Los valores de las variables para una paciente: lo que la vista previa muestra y el backend manda. */
export function valoresPara(variables: readonly VariableCampana[], nombre: string): string[] {
  return variables.map(v => (v.tipo === 'NOMBRE' ? (nombreDePila(nombre) ?? v.respaldo) : v.texto).trim());
}

/**
 * El horario en que salen las campañas, en La Paz. Espejo de `HORARIO_ENVIO`
 * del backend, que es el que manda: aquí solo se usa para decir «espera a las
 * 9:00» en vez de mostrar una campaña «Enviando» que no avanza.
 */
export const HORARIO_ENVIO = { desdeHora: 9, hastaHora: 20 } as const;

export function dentroDeHorarioEnvio(instante: Date): boolean {
  const hora = Number(new Intl.DateTimeFormat('en-US', { timeZone: ZONA_CLINICA, hour: '2-digit', hour12: false }).format(instante)) % 24;
  return hora >= HORARIO_ENVIO.desdeHora && hora < HORARIO_ENVIO.hastaHora;
}

/** Cuánto lleva: lo que ya no está pendiente (enviado, omitido o fallido) sobre el total. */
export function avance(m: Pick<MetricasCampana, 'total' | 'pendientes'>): number {
  return m.total > 0 ? Math.round(((m.total - m.pendientes) / m.total) * 100) : 0;
}
