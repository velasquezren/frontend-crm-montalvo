import { HttpErrorResponse } from '@angular/common/http';

/**
 * Extrae el mensaje de error legible que devuelve el backend NestJS.
 * Nest responde `{ statusCode, message, error }`, donde `message` puede ser
 * un string o un array de strings (errores de validación de class-validator).
 *
 * Úsalo en vez de `catch (err: any) { err.error?.message }` — centraliza el
 * único punto donde conocemos la forma de la respuesta de error.
 */
export function mensajeDeError(error: unknown, respaldo: string): string {
  if (error instanceof HttpErrorResponse) {
    const detalle = error.error?.message;

    if (Array.isArray(detalle) && detalle.length > 0) {
      return detalle.join('. ');
    }
    if (typeof detalle === 'string' && detalle.trim()) {
      return detalle;
    }
    /* Sin cuerpo de error: el servidor no respondió (status 0) o cayó. */
    if (error.status === 0) {
      return 'No se pudo contactar al servidor. Verifica tu conexión.';
    }
  }
  return respaldo;
}
