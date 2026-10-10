/*
 * El asistente de IA dentro del chat (backend: docs/asistente-ia.md): la
 * sugerencia que le prepara a la agente (modo SUGERIR) y la lectura del
 * comprobante de pago. El servidor decide todo; aquí solo se dice con palabras.
 */

/** Algo que el asistente propone mandar: la tarjeta de una promoción o la imagen de un horario. */
export interface AccionSugerida {
  readonly tipo: 'PROMOCION' | 'HORARIO';
  readonly titulo: string;
  readonly promocionId?: string;
  readonly medicoId?: number;
  readonly horario?: string | null;
}

/** `GET /conversaciones/:id` → `sugerencia`. Solo la pendiente y vigente. */
export interface SugerenciaDelChat {
  readonly id: string;
  /** Vacío cuando solo avisa (una consulta médica: la escribe la agente). */
  readonly texto: string;
  readonly acciones: readonly AccionSugerida[];
  /** Lo que el asistente cree que hay que hacer con el chat («Consulta médica: …»). */
  readonly aviso: string | null;
  readonly createdAt: string;
}

export type ResolucionSugerencia = 'usar' | 'descartar';

/** El botón de una acción, con lo que hace y a quién. */
export function etiquetaDeAccion(a: AccionSugerida): string {
  return a.tipo === 'PROMOCION' ? `Enviar tarjeta: ${a.titulo}` : `Enviar horario: ${a.titulo}`;
}

/* ── La lectura del comprobante ──────────────────────────────────────── */

export type EstadoVerificacion = 'OK' | 'ADVERTENCIA' | 'ALERTA';

export interface VerificacionComprobante {
  readonly campo: 'COMPROBANTE' | 'MONTO' | 'DESTINATARIO' | 'FECHA' | 'REFERENCIA';
  readonly estado: EstadoVerificacion;
  readonly texto: string;
}

/** `pago.lectura`: lo que se leyó del comprobante ACTUAL y cómo se compara. */
export interface LecturaComprobante {
  readonly mensajeId: string;
  readonly leidoEn: string;
  readonly resultado: 'COINCIDE' | 'REVISAR' | 'NO_ES_COMPROBANTE';
  readonly verificaciones: readonly VerificacionComprobante[];
}

/** El resumen de la lectura. Nunca «pagado»: coincide no es confirmado. */
export const RESULTADO_LECTURA: Readonly<Record<LecturaComprobante['resultado'], { readonly texto: string; readonly variante: 'success' | 'info' | 'critical' }>> = {
  COINCIDE: { texto: 'Coincide con lo esperado', variante: 'success' },
  REVISAR: { texto: 'Hay algo que revisar', variante: 'info' },
  NO_ES_COMPROBANTE: { texto: 'No parece un comprobante', variante: 'critical' },
};

/** Forma y color por estado: no solo color (la alerta es negra en esta paleta). */
export const ICONO_VERIFICACION: Readonly<Record<EstadoVerificacion, 'check' | 'alert-triangle' | 'x-circle'>> = {
  OK: 'check',
  ADVERTENCIA: 'alert-triangle',
  ALERTA: 'x-circle',
};
