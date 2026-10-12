/**
 * Los tonos de las porciones de un gráfico, derivados de la paleta cerrada
 * (`crm-design-system`: nada de hexadecimales nuevos, todo con `color-mix()`
 * sobre `primary` y `secondary`). Ordenados para que dos vecinos nunca queden a
 * una distancia mínima: oscuro, medio, claro, muy oscuro, claro…
 *
 * Existe porque `<app-donut-chart>` pintaba cada porción con `primary` cuando
 * el ítem no traía color, y las donas de Servicios y Ventas salían de un solo
 * verde: la proporción solo se leía en la leyenda.
 *
 * Con más categorías que tonos, se repite: más de ocho porciones ya no se leen
 * en una dona, y conviene agrupar el resto en «Otros».
 */
export const RAMPA_GRAFICOS: readonly string[] = [
  'var(--color-primary)',
  'var(--color-secondary)',
  'color-mix(in srgb, var(--color-primary) 45%, white)',
  'color-mix(in srgb, var(--color-primary) 65%, var(--color-text-dark))',
  'color-mix(in srgb, var(--color-secondary) 45%, white)',
  'color-mix(in srgb, var(--color-secondary) 55%, var(--color-primary))',
  'color-mix(in srgb, var(--color-secondary) 22%, white)',
  'color-mix(in srgb, var(--color-text-muted) 40%, white)',
];

/** El tono de la porción `i`. */
export function colorDeRampa(i: number): string {
  return RAMPA_GRAFICOS[((i % RAMPA_GRAFICOS.length) + RAMPA_GRAFICOS.length) % RAMPA_GRAFICOS.length];
}

/** Lo que no es nada («sin respuesta», «otros»): un gris claro de superficie, no el gris de texto. */
export const COLOR_NEUTRO_GRAFICO = 'color-mix(in srgb, var(--color-text-muted) 28%, white)';
