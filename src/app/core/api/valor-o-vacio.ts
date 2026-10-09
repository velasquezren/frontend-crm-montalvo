import { computed, Resource, Signal } from '@angular/core';

/**
 * El valor de un recurso, o `vacio` cuando no hay uno válido.
 *
 * Desde Angular 20, `value()` de un recurso en error LANZA (`ResourceValueError`).
 * La tabla de una pantalla lo resuelve con su rama de error, que va primero. Lo
 * de ARRIBA de la tabla no: los chips con su contador, las tarjetas de KPI, el
 * selector de agentes. Esos leían `value()` directo y, si la carga fallaba, la
 * plantilla entera lanzaba: la pantalla se rompía justo en vez de mostrar el
 * «No se pudo cargar… Reintentar» que tenía debajo (2026-10-09: Clientes,
 * Ventas, Leads, Actividades, Líneas, Servicios, Perfil, Nuevo chat).
 *
 * Lo que se pinta FUERA de la rama de contenido lee de aquí. Mientras recarga se
 * conserva lo anterior (eso ya lo hace el recurso); solo un error cae al vacío.
 */
export function valorOVacio<T>(recurso: Resource<T>, vacio: T): Signal<T> {
  return computed(() => (recurso.hasValue() ? recurso.value() : vacio));
}
