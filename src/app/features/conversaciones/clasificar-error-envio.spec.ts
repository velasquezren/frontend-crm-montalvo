import { HttpErrorResponse } from '@angular/common/http';
import { describe, expect, it } from 'vitest';

import { envioSeReintentaSinRiesgo } from './clasificar-error-envio';

/**
 * Qué errores permiten reintentar sin arriesgar un segundo WhatsApp real.
 *
 * El backend persiste el mensaje, emite el socket y dispara el envío a Meta
 * SIN `await`, y recién entonces responde el POST. No hay clave de
 * idempotencia. Así que un error posterior a la transacción es
 * indistinguible, desde el navegador, de uno anterior — salvo por el código,
 * y solo para los que el backend devuelve antes de tocar la base.
 */
describe('clasificación del error de envío', () => {
  const http = (status: number): HttpErrorResponse =>
    new HttpErrorResponse({ status, statusText: 'x', url: '/conversaciones/x/mensajes' });

  it.each([400, 401, 403, 404, 429])(
    'HTTP %i es seguro: el backend cortó antes de la transacción', status => {
      expect(envioSeReintentaSinRiesgo(http(status))).toBe(true);
    });

  it.each([0, 408, 500, 502, 503, 504])(
    'HTTP %i es AMBIGUO: el mensaje pudo salir igualmente', status => {
      expect(envioSeReintentaSinRiesgo(http(status))).toBe(false);
    });

  it('un error que no es HTTP tampoco se reintenta', () => {
    expect(envioSeReintentaSinRiesgo(new Error('roto'))).toBe(false);
    expect(envioSeReintentaSinRiesgo(null)).toBe(false);
  });

  it('el 502 del proxy es el caso peligroso y NO es seguro', () => {
    /* Aparece justo cuando el backend tardó de más, que es cuando más
       probable es que sí procesara el mensaje. */
    expect(envioSeReintentaSinRiesgo(http(502))).toBe(false);
  });
});
