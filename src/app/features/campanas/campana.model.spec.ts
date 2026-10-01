import { describe, expect, it } from 'vitest';

import { accionesDe, avance, dentroDeHorarioEnvio, faltaProgramacion, instanteProgramado, porcentaje, valoresPara } from './campana.model';

describe('campaña', () => {
  it('interpreta el día y la hora en La Paz, incluso al cruzar medianoche UTC', () => {
    expect(instanteProgramado('2026-10-01T23:30')).toBe('2026-10-02T03:30:00Z');
    expect(instanteProgramado('2026-02-30T10:00')).toBeNull();
    expect(instanteProgramado('2026-10-01T10:00Z')).toBeNull();
  });

  it('programar requiere una hora futura y no más de 30 días', () => {
    const ahora = new Date('2026-10-01T14:00:00Z');
    expect(faltaProgramacion('2026-10-01T14:00:00Z', ahora)).toContain('futura');
    expect(faltaProgramacion('2026-11-01T14:00:00Z', ahora)).toContain('30 días');
    expect(faltaProgramacion('2026-10-02T14:00:00Z', ahora)).toBeNull();
  });
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
