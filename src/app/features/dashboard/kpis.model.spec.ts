import { describe, expect, it } from 'vitest';

import { esFiltroInbox } from '../conversaciones/conversacion.model';
import { formatearEspera, porcentaje, variacion } from './kpis.model';

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
    expect(variacion(120, 100)).toEqual({ texto: '20 % más que', sube: true });
    expect(variacion(80, 100)).toEqual({ texto: '20 % menos que', sube: false });
    expect(variacion(100, 100)?.texto).toBe('igual que');
  });
});

describe('pestaña del inbox pedida por URL', () => {
  it('solo acepta pestañas que existen', () => {
    expect(esFiltroInbox('SIN_RESPONDER')).toBe(true);
    expect(esFiltroInbox('BORRADOS')).toBe(false);
    expect(esFiltroInbox(null)).toBe(false);
  });
});
