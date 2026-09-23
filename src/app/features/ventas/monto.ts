/**
 * El monto que teclea la agente, en bolivianos.
 *
 * Se leía con `Number()`, que entiende el punto como decimal: «4.500» —cuatro
 * mil quinientos, escrito como se escribe en Bolivia— se guardaba como
 * **Bs 4,50**, sin ningún aviso. «4.500,50» daba `NaN` y la agente no sabía por
 * qué el formulario rechazaba un monto que estaba bien.
 *
 * Reglas, en este orden:
 * - Con punto y coma, el último es el decimal (`4.500,50` y `4,500.50`).
 * - Solo coma: decimal si le siguen uno o dos dígitos (`45,5`); si le siguen
 *   tres, es de miles (`4,500`).
 * - Solo punto: igual, tres dígitos detrás = miles (`4.500`, `1.250.000`).
 *
 * Devuelve `null` si no es un monto positivo con como mucho dos decimales.
 */
export function parsearMonto(texto: string): number | null {
  const limpio = texto.replace(/\s|Bs\.?/gi, '');
  if (!/^\d[\d.,]*$/.test(limpio)) return null;

  const ultimoPunto = limpio.lastIndexOf('.');
  const ultimaComa = limpio.lastIndexOf(',');
  let normalizado: string;

  if (ultimoPunto >= 0 && ultimaComa >= 0) {
    const decimal = ultimoPunto > ultimaComa ? '.' : ',';
    const miles = decimal === '.' ? ',' : '.';
    normalizado = limpio.split(miles).join('').replace(decimal, '.');
  } else {
    const separador = ultimoPunto >= 0 ? '.' : ultimaComa >= 0 ? ',' : null;
    if (!separador) {
      normalizado = limpio;
    } else {
      const partes = limpio.split(separador);
      const esDeMiles = partes.length > 2 || partes[partes.length - 1]!.length === 3;
      normalizado = esDeMiles ? partes.join('') : partes.join('.');
    }
  }

  if (!/^\d+(\.\d{1,2})?$/.test(normalizado)) return null;
  const valor = Number(normalizado);
  return valor > 0 ? valor : null;
}
