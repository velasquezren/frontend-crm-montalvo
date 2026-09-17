import { describe, expect, it } from 'vitest';

import {
  horaClinica,
  inicioDelDiaClinica,
  mismoDiaClinica,
  sumarDiasClinica,
  ZONA_CLINICA,
} from './zona-clinica';

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

/**
 * A5.3 · «mismo día, distinta hora».
 *
 * Es la pregunta que decide si una edición puede propagarse a las futuras, y la
 * que más fácil se responde mal: en la franja de 20:00 a 24:00 de Bolivia, dos
 * instantes del MISMO día de la clínica ya están en días distintos de UTC —y en
 * días distintos del navegador de casi cualquier otra zona—.
 */
describe('A5.3 · mismoDiaClinica', () => {
  /* Los dos son el martes 16/09/2026 en la clínica: 20:30 y 21:30. En UTC son
     el 17 los dos, pero eso da igual; lo que importa es que en La Paz son el
     mismo martes y solo cambia la hora. */
  const MARTES_2030 = new Date('2026-09-17T00:30:00.000Z');
  const MARTES_2130 = new Date('2026-09-17T01:30:00.000Z');

  it('dos instantes de la misma noche boliviana son el mismo día, aunque UTC diga otra cosa', () => {
    expect(MARTES_2030.toISOString().slice(0, 10)).toBe('2026-09-17');
    expect(MARTES_2130.toISOString().slice(0, 10)).toBe('2026-09-17');
    expect(mismoDiaClinica(MARTES_2030, MARTES_2130)).toBe(true);
  });

  it('cruzar la medianoche de la clínica sí cambia de día, aunque UTC no cambie', () => {
    /* 16/09 23:30 y 17/09 00:30 en La Paz: dos días de clínica distintos, y los
       dos caen el 17 en UTC. Con la zona del navegador en UTC, esto se habría
       leído como «el mismo día», y la edición habría ofrecido propagar. */
    const antesDeMedianoche = new Date('2026-09-17T03:30:00.000Z');
    const despuesDeMedianoche = new Date('2026-09-17T04:30:00.000Z');
    expect(antesDeMedianoche.toISOString().slice(0, 10)).toBe('2026-09-17');
    expect(despuesDeMedianoche.toISOString().slice(0, 10)).toBe('2026-09-17');
    expect(mismoDiaClinica(antesDeMedianoche, despuesDeMedianoche)).toBe(false);
  });

  it('dos días distintos a la misma hora no son el mismo día', () => {
    expect(mismoDiaClinica(
      new Date('2026-09-16T18:00:00.000Z'),
      new Date('2026-09-17T18:00:00.000Z'),
    )).toBe(false);
  });
});

describe('A5.3 · horaClinica', () => {
  it('es la hora de reloj de la clínica, no la de UTC', () => {
    expect(horaClinica(new Date('2026-09-17T01:30:00.000Z'))).toBe('21:30');
    expect(horaClinica(new Date('2026-09-16T18:00:00.000Z'))).toBe('14:00');
  });

  it('la medianoche de la clínica es «00:00», con sus dos ceros', () => {
    expect(horaClinica(new Date('2026-09-17T04:00:00.000Z'))).toBe('00:00');
  });

  it('el formato es el que acepta el backend: HH:MM de dos dígitos', () => {
    /* `CambiarHoraFuturasDto` valida /^([01]\d|2[0-3]):[0-5]\d$/: un «9:05»
       sería rechazado con 400 y la agente vería un error sin saber por qué. */
    expect(horaClinica(new Date('2026-09-16T13:05:00.000Z'))).toBe('09:05');
  });
});
