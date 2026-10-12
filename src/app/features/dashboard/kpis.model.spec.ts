import { describe, expect, it } from 'vitest';

import { esFiltroInbox } from '../conversaciones/conversacion.model';
import { etiquetaDeBanda, formatearEspera, inicioReciente, mapaDeCalor, porcentaje, TRAMOS_RESPUESTA, variacion } from './kpis.model';

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

describe('mapaDeCalor', () => {
  it('junta las horas en bandas de dos, marca el pico y da la intensidad contra él', () => {
    const m = mapaDeCalor([
      { dia: 1, hora: 18, leads: 3 },
      { dia: 1, hora: 19, leads: 2 }, // misma banda que las 18
      { dia: 4, hora: 9, leads: 1 },
    ]);
    expect(m.celdas).toHaveLength(7);
    expect(m.celdas[1]).toHaveLength(12);
    expect(m.celdas[1][9]).toEqual({ leads: 5, intensidad: 1 });
    expect(m.celdas[4][4]).toEqual({ leads: 1, intensidad: 0.2 });
    expect(m.pico).toEqual({ dia: 1, banda: 9, leads: 5 });
    expect(etiquetaDeBanda(9)).toBe('18 a 20 h');
  });

  it('sin leads no hay pico ni intensidades, y lo que llega fuera de rango no rompe', () => {
    const m = mapaDeCalor([{ dia: 9, hora: 30, leads: 4 }]);
    expect(m.max).toBe(0);
    expect(m.pico).toBeNull();
    expect(m.celdas.flat().every(c => c.intensidad === 0)).toBe(true);
  });

  it('los tramos de la primera respuesta van de lo mejor a lo peor, y «sin respuesta» al final', () => {
    expect(TRAMOS_RESPUESTA.map(t => t.clave)).toEqual(['menos15', 'menosHora', 'menos4Horas', 'menosDia', 'masDia', 'sinRespuesta']);
  });
});
