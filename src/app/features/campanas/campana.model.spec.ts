import { describe, expect, it } from 'vitest';

import { accionesDe, avance, dentroDeHorarioEnvio, porcentaje, valoresPara } from './campana.model';

describe('campaña', () => {
  /* Espejo de `parametrosPara` del backend: la vista previa tiene que decir lo que se manda. */
  it('rellena con el nombre de pila o el respaldo, y con el texto fijo', () => {
    const variables = [{ tipo: 'NOMBRE', respaldo: 'hola' }, { tipo: 'TEXTO', texto: ' 20 % ' }] as const;
    expect(valoresPara(variables, 'MARÍA José Gutiérrez')).toEqual(['María', '20 %']);
    expect(valoresPara(variables, 'WhatsApp +59170000000')).toEqual(['hola', '20 %']);
  });

  it('ofrece solo las acciones que el estado permite', () => {
    expect(accionesDe('ENVIANDO')).toEqual({ pausar: true, reanudar: false, cancelar: true });
    expect(accionesDe('PAUSADA')).toEqual({ pausar: false, reanudar: true, cancelar: true });
    expect(accionesDe('TERMINADA')).toEqual({ pausar: false, reanudar: false, cancelar: false });
  });

  /* Sin base no hay porcentaje: un «0 %» se leería como un dato. */
  it('un porcentaje sin base es null, no 0', () => {
    expect(porcentaje(0, 0)).toBeNull();
    expect(porcentaje(1, 3)).toBe(33);
  });

  /* Mismo horario que el backend (La Paz, UTC−4): de 9:00 a 19:59. */
  it('sabe si es hora de enviar en La Paz', () => {
    expect(dentroDeHorarioEnvio(new Date('2026-10-01T12:59:00Z'))).toBe(false);
    expect(dentroDeHorarioEnvio(new Date('2026-10-01T13:00:00Z'))).toBe(true);
    expect(dentroDeHorarioEnvio(new Date('2026-10-02T00:00:00Z'))).toBe(false);
  });

  it('el avance cuenta todo lo que ya no está pendiente', () => {
    expect(avance({ total: 4, pendientes: 1 })).toBe(75);
    expect(avance({ total: 0, pendientes: 0 })).toBe(0);
  });
});
