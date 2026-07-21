/**
 * Sobre de respuesta de todo listado paginado del backend.
 * Espejo de `RespuestaPaginada<T>` en common/dto/pagination.dto.ts (NestJS).
 */
export interface RespuestaPaginada<T> {
  readonly datos: T[];
  readonly total: number;
  readonly pagina: number;
  readonly limite: number;
  readonly totalPaginas: number;
}

/** Valor inicial seguro para `httpResource`, evita comprobar null en la plantilla. */
export function paginaVacia<T>(): RespuestaPaginada<T> {
  return { datos: [], total: 0, pagina: 1, limite: 25, totalPaginas: 1 };
}
