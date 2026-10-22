import { BadgeVariant } from '../../../shared/components/badge/badge.component';

/*
 * Los WhatsApp de caja que reciben «comprobante nuevo, revíselo en FileMaker»
 * (backend: docs/avisos-caja.md). Solo administración los ve y los cambia.
 */

export interface NumeroCaja {
  readonly id: string;
  readonly nombre: string;
  readonly telefono: string;
  readonly agregadoPor: string | null;
  readonly agregadoEn: string;
}

export type EstadoPlantillaCaja = 'APROBADA' | 'EN_REVISION' | 'RECHAZADA' | 'NO_EXISTE' | 'SIN_CONEXION';

/** `GET /agenda/avisos-caja`. */
export interface AvisosCaja {
  readonly numeros: readonly NumeroCaja[];
  readonly plantilla: { readonly nombre: string; readonly estado: EstadoPlantillaCaja; readonly cuerpo: string; readonly pie: string };
  /** La línea desde la que sale (Recepción). */
  readonly linea: string | null;
  readonly maximo: number;
}

/** Qué significa cada estado para quien administra: si los avisos salen hoy o no, y por qué. */
export const ESTADO_PLANTILLA_CAJA: Readonly<Record<EstadoPlantillaCaja, { readonly etiqueta: string; readonly variante: BadgeVariant; readonly explicacion: string }>> = {
  APROBADA: { etiqueta: 'Activos', variante: 'success', explicacion: 'Meta aprobó la plantilla: cada comprobante que entra a la agenda avisa a estos números.' },
  EN_REVISION: { etiqueta: 'Esperando a Meta', variante: 'info', explicacion: 'La plantilla está en revisión en Meta. Los avisos empiezan a salir solos cuando la aprueben.' },
  RECHAZADA: { etiqueta: 'Plantilla rechazada', variante: 'critical', explicacion: 'Meta rechazó o pausó la plantilla: no sale ningún aviso hasta corregirla.' },
  NO_EXISTE: { etiqueta: 'Falta la plantilla', variante: 'neutral', explicacion: 'La plantilla todavía no está creada en Meta. Puedes cargar los números: los avisos salen cuando esté aprobada.' },
  SIN_CONEXION: { etiqueta: 'Sin conexión con Meta', variante: 'neutral', explicacion: 'No se pudo consultar Meta ahora. Vuelve a intentarlo en un momento.' },
};
