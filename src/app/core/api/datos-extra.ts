/**
 * `datosExtra` es el JSON libre del cliente: guarda el residuo de FileMaker que
 * no tiene columna propia. Sus valores son `unknown` a propósito — nadie
 * garantiza su forma — así que se estrechan aquí, en un solo sitio, en vez de
 * castear a `any` en cada punto de lectura.
 */
export type DatosExtra = Record<string, unknown>;

/**
 * Claves que escribe la aplicación (el resto viene de FileMaker y varía):
 * `empresa`, `lugarNacimiento`, `notas`, `tags`, `notaFijada`.
 * La edad NO se guarda aquí: se calcula desde `fechaNacimiento`.
 */

/**
 * Primer valor legible como texto entre las claves dadas, o cadena vacía.
 * Acepta varias claves porque FileMaker y el CRM nombran distinto lo mismo
 * (p. ej. `ocupacion` y `Profesion`).
 */
export function textoExtra(datos: DatosExtra | null | undefined, ...claves: string[]): string {
  if (!datos) return '';
  for (const clave of claves) {
    const valor = datos[clave];
    if (typeof valor === 'string' && valor.trim() !== '') return valor;
    if (typeof valor === 'number') return String(valor);
  }
  return '';
}

/** Igual que `textoExtra` pero devuelve `null` cuando no hay nada legible. */
export function textoExtraOpcional(
  datos: DatosExtra | null | undefined,
  ...claves: string[]
): string | null {
  return textoExtra(datos, ...claves) || null;
}

/** Lista de textos guardada bajo una clave (p. ej. `tags`), o vacía. */
export function listaExtra(datos: DatosExtra | null | undefined, clave: string): string[] {
  const valor = datos?.[clave];
  return Array.isArray(valor) ? valor.map(item => String(item)).filter(Boolean) : [];
}
