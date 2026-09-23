import { describe, expect, it } from 'vitest';

import { parsearMonto } from './monto';

describe('parsearMonto', () => {
  it('«4.500» son cuatro mil quinientos, no cuatro con cincuenta', () => {
    expect(parsearMonto('4.500')).toBe(4500);
    expect(parsearMonto('1.250.000')).toBe(1_250_000);
    expect(parsearMonto('4,500')).toBe(4500);
  });

  it('entiende los decimales en las dos notaciones', () => {
    expect(parsearMonto('4.500,50')).toBe(4500.5);
    expect(parsearMonto('4,500.50')).toBe(4500.5);
    expect(parsearMonto('45,5')).toBe(45.5);
    expect(parsearMonto('45.50')).toBe(45.5);
    expect(parsearMonto('Bs 4800')).toBe(4800);
  });

  it('rechaza lo que no es un monto válido', () => {
    expect(parsearMonto('')).toBeNull();
    expect(parsearMonto('0')).toBeNull();
    expect(parsearMonto('-100')).toBeNull();
    expect(parsearMonto('12,345')).toBe(12345);
    expect(parsearMonto('10.123,456')).toBeNull();
    expect(parsearMonto('abc')).toBeNull();
  });
});
