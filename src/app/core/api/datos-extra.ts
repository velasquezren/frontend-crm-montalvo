/**
 * `datosExtra` es el JSON libre del cliente: guarda el residuo de FileMaker que
 * no tiene columna propia. Sus valores son `unknown` a propósito — nadie
 * garantiza su forma — así que se estrechan aquí, en un solo sitio, en vez de
 * castear a `any` en cada punto de lectura.
 *
 * Claves que escribe la aplicación (el resto viene de FileMaker y varía):
 * `empresa`, `lugarNacimiento`, `notas`, `tags`, `notaFijada`. La edad NO se
 * guarda aquí: se calcula desde `fechaNacimiento`.
 */
export type DatosExtra = Record<string, unknown>;

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

/** Lista de textos guardada bajo las claves dadas (p. ej. `tags`, `intereses`), o vacía. */
export function listaExtra(datos: DatosExtra | null | undefined, ...claves: string[]): string[] {
  if (!datos) return [];
  const resultados: string[] = [];
  for (const clave of claves) {
    const valor = datos[clave];
    if (Array.isArray(valor)) {
      resultados.push(...valor.map(item => String(item).trim()).filter(Boolean));
    } else if (typeof valor === 'string' && valor.trim() !== '') {
      resultados.push(...valor.split(',').map(s => s.trim()).filter(Boolean));
    }
  }
  return [...new Set(resultados)];
}
