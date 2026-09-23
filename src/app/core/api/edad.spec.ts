import { describe, expect, it } from 'vitest';

import { calcularEdad, edadDePaciente } from './edad';

describe('calcularEdad', () => {
  const hoy = (anio: number, mes: number, dia: number) => new Date(anio, mes - 1, dia, 12);

  it('no cumple años el día anterior aunque la fecha llegue como medianoche UTC', () => {
    expect(calcularEdad('1990-09-23T00:00:00.000Z', hoy(2026, 9, 22))).toBe('35 años');
    expect(calcularEdad('1990-09-23T00:00:00.000Z', hoy(2026, 9, 23))).toBe('36 años');
  });

  it('el 1 de enero no se convierte en el 31 de diciembre del año anterior', () => {
    expect(calcularEdad('2000-01-01T00:00:00.000Z', hoy(2026, 1, 1))).toBe('26 años');
  });

  it('descarta lo que no es una fecha o da una edad imposible', () => {
    expect(calcularEdad('sin dato', hoy(2026, 9, 23))).toBeNull();
    expect(calcularEdad('1850-01-01', hoy(2026, 9, 23))).toBeNull();
    expect(calcularEdad('2030-01-01', hoy(2026, 9, 23))).toBeNull();
    expect(calcularEdad(null)).toBeNull();
  });
});

describe('edadDePaciente', () => {
  it('usa la fecha de FileMaker cuando la columna está vacía', () => {
    expect(edadDePaciente({ fechaNacimiento: null, datosExtra: { fn: '1990-01-15' } })).not.toBeNull();
    expect(edadDePaciente({ fechaNacimiento: null, datosExtra: null })).toBeNull();
  });
});
