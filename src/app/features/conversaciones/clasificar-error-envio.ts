import { HttpErrorResponse } from '@angular/common/http';

/**
 * ¿Se puede reintentar este envío sin arriesgar un segundo WhatsApp real?
 *
 * El backend hace, en este orden: persiste el mensaje en una transacción,
 * emite el aviso por socket, **dispara el envío a Meta sin `await`** y recién
 * entonces responde el POST. No hay clave de idempotencia: el DTO acepta solo
 * `contenido` y los campos de adjunto, y el único campo único de `Mensaje` es
 * `whatsappMsgId`, que Meta asigna DESPUÉS del despacho.
 *
 * Consecuencia: si la respuesta HTTP se pierde, el mensaje puede haber salido
 * igualmente. Reintentar crearía una segunda fila y un segundo despacho. El
 * propio backend documenta haber sufrido justo eso.
 *
 * Por eso solo se consideran seguros los códigos que el backend devuelve
 * ANTES de abrir la transacción:
 *
 * - `400` la validación del DTO rechazó el cuerpo;
 * - `401` el guard cortó antes de llegar al controlador;
 * - `403` ventana de 24 h vencida o conversación ajena;
 * - `404` la conversación o el adjunto no existen;
 * - `429` el rate-limit lo descartó sin procesarlo.
 *
 * Todo lo demás es ambiguo por definición: `0` (la conexión se cortó y la
 * petición pudo llegar), `408`, `500` —que puede venir de después de la
 * transacción— y los `502/503/504` del proxy, que aparecen justo cuando el
 * backend tardó demasiado, es decir cuando más probable es que sí procesara.
 */
const CODIGOS_SEGUROS = new Set([400, 401, 403, 404, 429]);

export function envioSeReintentaSinRiesgo(error: unknown): boolean {
  if (!(error instanceof HttpErrorResponse)) return false;
  return CODIGOS_SEGUROS.has(error.status);
}
