import { describe, expect, it } from 'vitest';

import { MESES, nombreMes, nombreMesCorto } from './meses';

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
