import { describe, expect, it } from 'vitest';

import { MESES, nombreDiaCorto, nombreMes, nombreMesCorto, nombreMesCortoMinuscula } from './meses';

/*
 * Lo que fija esta suite es el caso raro, que es donde las seis copias que esto
 * sustituye habían divergido: una devolvía `Mes 13`, tres `13` y una **cadena
 * vacía**. La última hacía que un mes inválido saliera invisible en el módulo de
 * comisiones — una etiqueta de periodo en blanco y ninguna señal de por qué.
 */
describe('nombreMes', () => {
  it('nombra los doce meses', () => {
    expect(nombreMes(1)).toBe('Enero');
    expect(nombreMes(12)).toBe('Diciembre');
    expect(MESES).toHaveLength(12);
  });

  it.each([0, 13, -1, 99])('un mes fuera de rango (%s) se VE, no desaparece', mes => {
    const texto = nombreMes(mes);
    expect(texto).not.toBe('');
    expect(texto).toContain(String(mes));
  });

  it('la versión corta sirve para ejes y columnas estrechas', () => {
    expect(nombreMesCorto(1)).toBe('Ene');
    expect(nombreMesCorto(12)).toBe('Dic');
    expect(nombreMesCorto(13)).not.toBe('');
  });
});

/*
 * Un mes fuera de 1-12 es un dato roto, y la regla del archivo es que se DIGA.
 *
 * Es la cicatriz de `nombreMes` regenerada: el array en minúscula estaba
 * copiado en cuatro archivos —uno dentro de `shared/models/` mismo— y las
 * copias ya daban tres respuestas distintas al mismo mes inválido:
 * `undefined` en `catalogo.ts`, `'—'` en el cajón del médico y `M13` aquí.
 * `undefined` miente en voz alta y `'—'` miente callando.
 */
describe('un mes o un día fuera de rango se dice, no se esconde', () => {
  it('nombreMesCortoMinuscula nunca devuelve `undefined`', () => {
    expect(nombreMesCortoMinuscula(1)).toBe('ene');
    expect(nombreMesCortoMinuscula(12)).toBe('dic');
    expect(nombreMesCortoMinuscula(13)).toBe('m13');
    expect(nombreMesCortoMinuscula(0)).toBe('m0');
    /* El respaldo también se pasa a minúscula, así que sale «mnan»: feo a
       propósito. Un mes roto tiene que verse roto. */
    expect(nombreMesCortoMinuscula(Number.NaN)).toBe('mnan');
  });

  it('es el MISMO array que la variante capitalizada, no una segunda copia', () => {
    for (let mes = 1; mes <= 12; mes++) {
      expect(nombreMesCortoMinuscula(mes)).toBe(nombreMesCorto(mes).toLowerCase());
    }
  });

  it('nombreDiaCorto empieza en lunes, como `Temporal.dayOfWeek`', () => {
    expect(nombreDiaCorto(1)).toBe('lun');
    expect(nombreDiaCorto(7)).toBe('dom');
    expect(nombreDiaCorto(8)).toBe('D8');
  });
});
