import { Temporal } from 'temporal-polyfill';
import { describe, expect, it } from 'vitest';

import { mismoRango, rangoCalendarioDe } from './rango-calendario';

/**
 * El contrato de rango, que es donde viven los bugs de calendario: fin de mes,
 * medianoche, zona horaria y cambio de año. Se prueba aparte de Angular porque
 * es aritmética pura y merece fallar en un sitio concreto.
 */

/** La zona de la clínica: Bolivia, UTC-4 fijo y sin horario de verano. */
const LA_PAZ = 'America/La_Paz';

function zoned(iso: string, zona = LA_PAZ): Temporal.ZonedDateTime {
  return Temporal.PlainDateTime.from(iso).toZonedDateTime(zona);
}

describe('rangoCalendarioDe', () => {
  it('abre en el primer milisegundo del primer día visible', () => {
    const { desde } = rangoCalendarioDe(zoned('2026-09-01T09:30:00'), zoned('2026-09-30T18:00:00'));
    // 00:00 en La Paz (UTC-4) es 04:00 UTC del mismo día.
    expect(desde).toBe('2026-09-01T04:00:00Z');
  });

  it('cierra en el último milisegundo del último día visible, no a medianoche', () => {
    const { hasta } = rangoCalendarioDe(zoned('2026-09-01T00:00:00'), zoned('2026-09-30T00:00:00'));
    /* La trampa del último día: cerrar en el 30 a las 00:00 dejaría fuera todo
       lo programado ese día. El cierre es el 30 a las 23:59:59.999 locales, que
       en UTC cae ya en el 1 de octubre. */
    expect(hasta).toBe('2026-10-01T03:59:59.999Z');
  });

  it('una actividad del último día a las 23:40 entra en el rango', () => {
    const { desde, hasta } = rangoCalendarioDe(zoned('2026-09-01T00:00:00'), zoned('2026-09-30T00:00:00'));
    const laDeLasOnceYCuarenta = Temporal.PlainDateTime.from('2026-09-30T23:40:00')
      .toZonedDateTime(LA_PAZ).toInstant().toString();
    expect(laDeLasOnceYCuarenta >= desde).toBe(true);
    expect(laDeLasOnceYCuarenta <= hasta).toBe(true);
  });

  it('una actividad a las 00:00 del primer día también entra', () => {
    const { desde } = rangoCalendarioDe(zoned('2026-09-01T10:00:00'), zoned('2026-09-30T10:00:00'));
    const medianoche = Temporal.PlainDateTime.from('2026-09-01T00:00:00')
      .toZonedDateTime(LA_PAZ).toInstant().toString();
    expect(medianoche >= desde).toBe(true);
  });

  it('cruza el fin de año sin aritmética de meses a mano', () => {
    // La rejilla de diciembre 2026 suele terminar ya en enero de 2027.
    const { desde, hasta } = rangoCalendarioDe(zoned('2026-11-30T00:00:00'), zoned('2027-01-03T00:00:00'));
    expect(desde).toBe('2026-11-30T04:00:00Z');
    expect(hasta).toBe('2027-01-04T03:59:59.999Z');
  });

  it('febrero bisiesto no pierde el día 29', () => {
    const { hasta } = rangoCalendarioDe(zoned('2028-02-01T00:00:00'), zoned('2028-02-29T00:00:00'));
    expect(hasta).toBe('2028-03-01T03:59:59.999Z');
  });

  it('el mismo día civil da instantes distintos en zonas distintas', () => {
    const bolivia = rangoCalendarioDe(zoned('2026-09-01T00:00:00'), zoned('2026-09-30T00:00:00'));
    const madrid = rangoCalendarioDe(
      zoned('2026-09-01T00:00:00', 'Europe/Madrid'),
      zoned('2026-09-30T00:00:00', 'Europe/Madrid'),
    );
    /* El rango se calcula en la zona del navegador, que es la misma con la que
       el calendario pinta los eventos. Si se calculara en UTC, a una agente en
       Bolivia le faltarían las cuatro primeras horas de su día 1. */
    expect(bolivia.desde).not.toBe(madrid.desde);
    expect(madrid.desde).toBe('2026-08-31T22:00:00Z');
  });
});

describe('mismoRango', () => {
  const uno = { desde: '2026-09-01T04:00:00Z', hasta: '2026-10-01T03:59:59.999Z' };

  it('compara por valor, no por identidad', () => {
    expect(mismoRango(uno, { ...uno })).toBe(true);
  });

  it('distingue meses distintos', () => {
    expect(mismoRango(uno, { ...uno, desde: '2026-10-01T04:00:00Z' })).toBe(false);
  });

  it('trata el nulo como un estado más', () => {
    expect(mismoRango(null, null)).toBe(true);
    expect(mismoRango(null, uno)).toBe(false);
  });
});
