import { describe, expect, it } from 'vitest';

import { esFiltroInbox } from '../conversaciones/conversacion.model';
import { formatearEspera, inicioReciente, porcentaje, variacion } from './kpis.model';

/**
 * Lo que el dashboard le DICE a la agente sale de estas tres funciones. Se
 * fijan los bordes: sin base, sin periodo anterior, el salto de minutos a
 * horas y a días.
 */
describe('formatearEspera', () => {
  it('lee minutos, horas y días como una persona', () => {
    expect(formatearEspera(35)).toBe('35 min');
    expect(formatearEspera(60)).toBe('1 h');
    expect(formatearEspera(124)).toBe('2 h 4 min');
    expect(formatearEspera(60 * 24 * 3 + 120)).toBe('3 d 2 h');
  });

  it('sin respuestas no inventa un cero', () => {
    expect(formatearEspera(null)).toBe('—');
  });
});

describe('porcentaje y variación', () => {
  it('sin base no hay porcentaje: «0 %» sobre cero sería un dato falso', () => {
    expect(porcentaje(0, 0)).toBeNull();
    expect(porcentaje(234, 285)).toBe(82);
  });

  it('contra un periodo vacío no se compara', () => {
    expect(variacion(10, 0)).toBeNull();
  });

  it('dice la dirección en palabras', () => {
    expect(variacion(120, 100)).toEqual({ texto: '20 % más que', corto: '+20 %', sube: true });
    expect(variacion(80, 100)).toEqual({ texto: '20 % menos que', corto: '−20 %', sube: false });
    expect(variacion(100, 100)).toEqual({ texto: 'igual que', corto: '=', sube: true });
  });
});

describe('pestaña del inbox pedida por URL', () => {
  it('solo acepta pestañas que existen', () => {
    expect(esFiltroInbox('SIN_RESPONDER')).toBe(true);
    expect(esFiltroInbox('BORRADOS')).toBe(false);
    expect(esFiltroInbox(null)).toBe(false);
  });
});

/* El 1 de octubre a las 00:09 el Dashboard salía en cero y parecía roto. */
describe('inicioReciente', () => {
  const desde = '2026-10-01T04:00:00.000Z'; // 00:00 en La Paz
  it('dice cuánto lleva el periodo mientras es reciente', () => {
    expect(inicioReciente(desde, new Date('2026-10-01T04:09:00Z'), 3)).toBe('hace menos de una hora');
    expect(inicioReciente(desde, new Date('2026-10-01T05:00:00Z'), 3)).toBe('hace 1 hora');
    expect(inicioReciente(desde, new Date('2026-10-02T06:00:00Z'), 3)).toBe('hace 1 día');
  });

  it('pasados los días, no dice nada', () => {
    expect(inicioReciente(desde, new Date('2026-10-04T04:00:00Z'), 3)).toBeNull();
  });
});
