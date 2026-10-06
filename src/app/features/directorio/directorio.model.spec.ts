import { describe, expect, it } from 'vitest';

import { bloquesEditables, problemasDelHorario } from './directorio.model';

const b = (diaSemana: number, desde: string, hasta: string) => ({ diaSemana, desde, hasta, lugar: '' });

describe('horario del directorio', () => {
  it('un horario bien cargado no tiene problemas; bloques que se tocan tampoco', () => {
    expect(problemasDelHorario([b(1, '08:00', '12:00'), b(1, '12:00', '14:00'), b(2, '15:00', '19:00')])).toEqual([]);
  });

  it('avisa al revés, horas mal escritas y solapes, como el backend', () => {
    expect(problemasDelHorario([b(1, '12:00', '08:00')])[0]).toMatch(/posterior/);
    expect(problemasDelHorario([b(1, '8:00', '12:00')])[0]).toMatch(/08:00/);
    expect(problemasDelHorario([b(3, '08:00', '12:00'), b(3, '11:00', '13:00')])[0]).toMatch(/Miércoles: hay bloques que se superponen/);
  });

  it('el horario guardado se edita ordenado por día y hora', () => {
    const editables = bloquesEditables([
      { diaSemana: 2, desde: '15:00', hasta: '19:00', lugar: null },
      { diaSemana: 1, desde: '08:00', hasta: '12:00', lugar: 'Consultorio 3' },
    ]);
    expect(editables).toEqual([{ diaSemana: 1, desde: '08:00', hasta: '12:00', lugar: 'Consultorio 3' }, b(2, '15:00', '19:00')]);
  });
});
