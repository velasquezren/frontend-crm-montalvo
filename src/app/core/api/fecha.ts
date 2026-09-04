/**
 * `YYYY-MM-DDTHH:mm` en hora LOCAL del navegador — lo que espera (y devuelve)
 * un `<input type="datetime-local">`. Compartido entre `ActividadesPage` y el
 * modal rápido de `ConversacionSidebarComponent`: los dos agendan una
 * `Actividad` y los dos necesitan esta misma conversión, así que vive una
 * sola vez en vez de copiada.
 */
export function aDatetimeLocal(fecha: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${fecha.getFullYear()}-${p(fecha.getMonth() + 1)}-${p(fecha.getDate())}T${p(fecha.getHours())}:${p(fecha.getMinutes())}`;
}
