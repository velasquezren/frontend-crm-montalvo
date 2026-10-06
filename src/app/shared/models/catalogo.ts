/**
 * Funciones puras que comparten Promociones y Directorio médico: fechas de
 * calendario (columnas `@db.Date` del backend), precios tecleados e imágenes
 * públicas. Una regla escrita en dos vistas es una función compartida
 * (crm-feature-page): si cada dominio validara su imagen a su manera, una foto
 * pasaría en una pantalla y no en la otra.
 */

/** Los tipos que el backend acepta (`validarImagenPublica`): se leen de los bytes allá; aquí se avisa antes. */
export const TIPOS_IMAGEN_PUBLICA = 'image/jpeg,image/png,image/webp';
/** El tope del backend (`BYTES_MAXIMOS_IMAGEN`): se avisa antes de subir 20 MB para nada. */
export const BYTES_MAXIMOS_IMAGEN = 5 * 1024 * 1024;

/** Por qué un archivo elegido no se puede subir, sin esperar al servidor. `null` si se puede intentar. */
export function problemaDeImagen(archivo: Pick<File, 'size' | 'type'>): string | null {
  if (!TIPOS_IMAGEN_PUBLICA.split(',').includes(archivo.type)) return 'Solo imágenes JPG, PNG o WebP.';
  if (archivo.size > BYTES_MAXIMOS_IMAGEN) return 'La imagen pesa más de 5 MB.';
  return null;
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** «2026-10-13» (un día de La Paz, sin hora) → «13 oct 2026». `null` → «sin fecha de fin». */
export function fechaCorta(fecha: string | null): string {
  if (!fecha) return 'sin fecha de fin';
  const [anio, mes, dia] = fecha.split('-').map(Number);
  return `${dia} ${MESES[mes - 1]} ${anio}`;
}

/** Un precio tecleado («480», «480,50», «») → número, `null` si está vacío, `undefined` si no es un precio. */
export function precioDeTexto(texto: string): number | null | undefined {
  const limpio = texto.trim().replace(/\s/g, '').replace(',', '.');
  if (limpio === '') return null;
  if (!/^\d+(\.\d{1,2})?$/.test(limpio)) return undefined;
  return Number(limpio);
}
