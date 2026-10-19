import { describe, expect, it } from 'vitest';

import { alternarCupo, cantidadDeCupos, enumerarHoras, fechaParaPaciente, textoDeCupos } from './cupos-medico';

const medico = { nombre: 'Dra. Sintética', especialidad: 'Ginecología' };

describe('cupos de un médico en el compositor', () => {
  it('elegir y quitar horas no muta la selección y deja cada día en orden', () => {
    const vacia = {};
    const una = alternarCupo(vacia, '2026-10-23', '11:00');
    const dos = alternarCupo(una, '2026-10-23', '10:30');
    expect(vacia).toEqual({});
    expect(dos).toEqual({ '2026-10-23': ['10:30', '11:00'] });
    expect(cantidadDeCupos(dos)).toBe(2);
    expect(alternarCupo(alternarCupo(dos, '2026-10-23', '10:30'), '2026-10-23', '11:00')).toEqual({});
  });

  it('la fecha se escribe como se le habla a la paciente, sin depender de la zona del navegador', () => {
    expect(fechaParaPaciente('2026-10-23')).toBe('viernes 23 de octubre');
    expect(fechaParaPaciente('2026-11-01')).toBe('domingo 1 de noviembre');
    expect(fechaParaPaciente('no-es-fecha')).toBe('no-es-fecha');
  });

  it('enumera las horas como en una frase', () => {
    expect(enumerarHoras(['09:00'])).toBe('09:00');
    expect(enumerarHoras(['09:00', '10:30'])).toBe('09:00 y 10:30');
    expect(enumerarHoras(['09:00', '10:30', '11:00'])).toBe('09:00, 10:30 y 11:00');
  });

  it('una sola hora: una frase que pregunta, sin prometer la reserva', () => {
    expect(textoDeCupos(medico, { '2026-10-23': ['10:30'] })).toBe(
      'Tenemos un horario disponible con Dra. Sintética (Ginecología): el viernes 23 de octubre a las 10:30. ¿Le queda bien?',
    );
  });

  it('varias horas: un día por línea, en orden de fecha', () => {
    const texto = textoDeCupos({ nombre: 'Dr. Prueba', especialidad: null }, {
      '2026-10-26': ['09:00'],
      '2026-10-23': ['10:30', '11:00'],
    });
    expect(texto).toBe([
      'Tenemos estos horarios disponibles con Dr. Prueba:',
      '• Viernes 23 de octubre: 10:30 y 11:00',
      '• Lunes 26 de octubre: 09:00',
      '¿Cuál le queda mejor?',
    ].join('\n'));
  });

  it('sin horas elegidas no hay texto', () => {
    expect(textoDeCupos(medico, {})).toBe('');
    expect(textoDeCupos(medico, { '2026-10-23': [] })).toBe('');
  });
});
