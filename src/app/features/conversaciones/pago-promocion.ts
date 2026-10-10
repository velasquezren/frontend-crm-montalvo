import { EstadoPagoPromocion } from '../../core/api/db-enums';
import type { LecturaComprobante } from './asistente-chat';

/*
 * El pago de una promoción dentro del chat (backend: docs/pagos-promocion.md).
 * El servidor decide el estado y valida cada acción; aquí solo se dice con
 * palabras. Ninguna regla de negocio vive en este archivo.
 */

/** El pago tal como viaja en el detalle del chat (`GET /conversaciones/:id` → `pago`). */
export interface PagoDelChat {
  readonly id: string;
  readonly estado: EstadoPagoPromocion;
  readonly monto: number;
  readonly promocion: { readonly id: string; readonly titulo: string; readonly codigo: string };
  /** El mensaje (foto o PDF) que mandó como comprobante. */
  readonly comprobanteMensajeId: string | null;
  /** Por qué se le pidió otro comprobante, si se le pidió. */
  readonly motivoRechazo: string | null;
  readonly ventaId: string | null;
  /** Confirmación iniciada, todavía sin venta enlazada. */
  readonly registroPendiente?: boolean;
  /** Resultado del intento de aviso, solo en la respuesta de una acción. */
  readonly avisoPaciente?: 'ENCOLADO' | 'NO_ENVIADO';
  readonly cerradoPor: { readonly id: string; readonly nombre: string } | null;
  readonly cerradoEn: string | null;
  readonly createdAt: string;
  /** Lo que el asistente leyó en el comprobante actual. Ayuda a verificar; no confirma nada. */
  readonly lectura?: LecturaComprobante | null;
}

/** La promoción por la que llegó con su código `PRM-…` (solo la línea comercial). */
export interface PromocionDelChat {
  readonly id: string;
  readonly titulo: string;
  readonly codigo: string;
}

export type AccionPago = 'confirmar' | 'pedir-otro' | 'anular';

/** El estado, dicho como lo diría una agente. Nunca «pagado» antes de verificarlo. */
export const ESTADO_PAGO: Readonly<Record<EstadoPagoPromocion, string>> = {
  PENDIENTE: 'Esperando comprobante',
  COMPROBANTE_ENVIADO: 'Comprobante por verificar',
  CONFIRMADO: 'Pago confirmado',
  ANULADO: 'Pago anulado',
};

/** Color solo donde hay algo que hacer o algo logrado. */
export const VARIANTE_PAGO: Readonly<Record<EstadoPagoPromocion, 'info' | 'critical' | 'success' | 'neutral'>> = {
  PENDIENTE: 'info',
  COMPROBANTE_ENVIADO: 'critical',
  CONFIRMADO: 'success',
  ANULADO: 'neutral',
};

/** Lo que dice el aviso al terminar cada acción. */
export const AVISO_PAGO: Readonly<Record<AccionPago, string>> = {
  confirmar: 'Pago confirmado: se registró la venta.',
  'pedir-otro': 'Pago pendiente de un nuevo comprobante.',
  anular: 'Pago anulado.',
};

/** Guardar el pago y enviar su aviso son resultados diferentes. */
export function avisoDeAccionPago(accion: AccionPago, resultado: PagoDelChat | null): { texto: string; advertencia: boolean } {
  const texto = AVISO_PAGO[accion];
  if (resultado?.avisoPaciente === 'NO_ENVIADO') {
    return { texto: `${texto} No se pudo enviar el aviso. Revisa el chat y avisa a la paciente; si pasaron 24 horas, usa una plantilla.`, advertencia: true };
  }
  return { texto: texto + (resultado?.avisoPaciente === 'ENCOLADO' ? ' Aviso preparado; consulta su entrega en el chat.' : ''), advertencia: false };
}
