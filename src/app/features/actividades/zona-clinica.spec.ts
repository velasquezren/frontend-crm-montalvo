import { describe, expect, it } from 'vitest';

import { inicioDelDiaClinica, sumarDiasClinica, ZONA_CLINICA } from './zona-clinica';

/**
 * A1 · el día de calendario de la clínica, en el navegador.
 *
 * **Los instantes esperados son EXACTAMENTE los mismos que fija
 * `common/fechas/zona-clinica.spec.ts` en el backend.** Esa coincidencia
 * literal es lo que mantiene unidas las dos mitades: si alguien cambia la zona
 * en un lado, caen las pruebas del otro.
 *
 * Al ser instantes ISO exactos, no dependen de la zona de la máquina que las
 * corre — que es justo la dependencia que A1 viene a quitar.
 */

/** 16/09/2026 21:30 en La Paz — que en UTC ya es el 17. La franja del fallo. */
const NOCHE_DEL_16 = new Date('2026-09-17T01:30:00.000Z');

describe('A1 · inicioDelDiaClinica', () => {
  it('la zona es explícita y es la de la clínica', () => {
    expect(ZONA_CLINICA).toBe('America/La_Paz');
  });

  it('1 · instante normal, mismo día en UTC y en Bolivia', () => {
    expect(inicioDelDiaClinica(new Date('2026-09-16T18:00:00.000Z')).toISOString())
      .toBe('2026-09-16T04:00:00.000Z');
  });

  it('2 · franja en la que UTC ya está en el día siguiente', () => {
    expect(NOCHE_DEL_16.toISOString().slice(0, 10)).toBe('2026-09-17');
    expect(inicioDelDiaClinica(NOCHE_DEL_16).toISOString()).toBe('2026-09-16T04:00:00.000Z');
  });

  it('3 · la medianoche de Bolivia abre el día, no lo cierra', () => {
    const medianoche = new Date('2026-09-17T04:00:00.000Z');
    expect(inicioDelDiaClinica(medianoche).toISOString()).toBe('2026-09-17T04:00:00.000Z');
    expect(inicioDelDiaClinica(new Date(medianoche.getTime() - 1)).toISOString())
      .toBe('2026-09-16T04:00:00.000Z');
  });

  it('4 · fin de mes', () => {
    const inicio = inicioDelDiaClinica(new Date('2026-10-01T02:00:00.000Z'));
    expect(inicio.toISOString()).toBe('2026-09-30T04:00:00.000Z');
    expect(sumarDiasClinica(inicio, 1).toISOString()).toBe('2026-10-01T04:00:00.000Z');
  });

  it('5 · fin de año', () => {
    const inicio = inicioDelDiaClinica(new Date('2027-01-01T01:00:00.000Z'));
    expect(inicio.toISOString()).toBe('2026-12-31T04:00:00.000Z');
    expect(sumarDiasClinica(inicio, 1).toISOString()).toBe('2027-01-01T04:00:00.000Z');
  });

  it('febrero bisiesto no pierde el día 29', () => {
    const inicio = inicioDelDiaClinica(new Date('2028-02-28T18:00:00.000Z'));
    expect(sumarDiasClinica(inicio, 1).toISOString()).toBe('2028-02-29T04:00:00.000Z');
    expect(sumarDiasClinica(inicio, 2).toISOString()).toBe('2028-03-01T04:00:00.000Z');
  });

  it('sumar siete días cruza el mes sin aritmética de 24 h a mano', () => {
    expect(sumarDiasClinica(inicioDelDiaClinica(NOCHE_DEL_16), 7).toISOString())
      .toBe('2026-09-23T04:00:00.000Z');
  });
});
