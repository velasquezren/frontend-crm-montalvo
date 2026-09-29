import { HttpErrorResponse } from '@angular/common/http';

/**
 * Extrae el mensaje de error legible que devuelve el backend NestJS.
 * Nest responde `{ statusCode, message, error }`, donde `message` puede ser
 * un string o un array de strings (errores de validación de class-validator).
 *
 * Úsalo en vez de `catch (err: any) { err.error?.message }` — centraliza el
 * único punto donde conocemos la forma de la respuesta de error.
 */
/**
 * ¿El backend rechazó por un dato que ya es de otra ficha? (409)
 *
 * Merece un trato distinto del error genérico: no es un fallo del sistema ni
 * algo que se arregle reintentando, sino un dato que hay que corregir. Por eso
 * se muestra en el campo y no como error rojo, y el formulario sigue abierto
 * con lo tecleado.
 */
export function esConflicto(error: unknown): boolean {
  return error instanceof HttpErrorResponse && error.status === 409;
}

/**
 * Qué campo provocó el 409, si el backend lo dijo (`{ campo: 'telefono' }`).
 *
 * Es lo que permite marcar el control correcto. Deducirlo del texto del mensaje
 * funcionaría hasta que alguien reescriba el mensaje, y un choque de PAC
 * acabaría señalando la casilla del teléfono.
 */
export function campoEnConflicto(error: unknown): string | undefined {
  if (!(error instanceof HttpErrorResponse)) return undefined;
  const campo: unknown = error.error?.campo;
  return typeof campo === 'string' && campo ? campo : undefined;
}

/** Lo que el servidor rechazó por duplicado: el valor exacto y lo que dijo. */
export interface Choque {
  readonly valor: string;
  readonly mensaje: string;
}

/**
 * El aviso de un valor que el servidor ya rechazó, mientras siga siendo el que
 * está escrito.
 *
 * Que dependa del VALOR —y no de un booleano— es lo que hace que se borre solo
 * al corregirlo. Con una bandera haría falta un `effect` que la limpiara en
 * cada pulsación, y olvidarlo deja el campo en rojo sobre un dato ya bueno.
 */
export function choqueDe(choque: Choque | null, actual: string | null): string | undefined {
  return choque && choque.valor === actual ? choque.mensaje : undefined;
}

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
