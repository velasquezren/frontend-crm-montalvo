import { describe, expect, it } from 'vitest';

import { campanaOrigenDe } from './campana-origen';

/*
 * Lo que fija esta suite es el CONTRATO con lo que Meta manda y con lo que el
 * CRM guardó en el pasado. El banner de campaña se pinta sobre un JSON sin
 * esquema (`datosExtra`), así que el riesgo real no es la lógica —son tres
 * líneas— sino que un chat viejo, o un anuncio que Meta manda a medias, deje la
 * vista rota delante de una agente.
 */
describe('campanaOrigenDe', () => {
  it('devuelve null cuando el chat no entró por un anuncio', () => {
    expect(campanaOrigenDe(null)).toBeNull();
    expect(campanaOrigenDe(undefined)).toBeNull();
    expect(campanaOrigenDe({})).toBeNull();
    expect(campanaOrigenDe({ campanaOrigen: null })).toBeNull();
    expect(campanaOrigenDe({ campanaOrigen: 'texto suelto' })).toBeNull();
  });

  it('un registro con solo `fecha` no pinta banner', () => {
    expect(campanaOrigenDe({ campanaOrigen: { fecha: '2026-01-01T00:00:00Z' } })).toBeNull();
  });

  it('lee un chat ANTERIOR al 14-09-2026, que solo guardó cuatro campos', () => {
    const vieja = campanaOrigenDe({
      campanaOrigen: {
        titular: 'Promo Rinoplastia',
        anuncioId: '120215',
        cuerpo: 'Agenda tu valoración',
        origenUrl: 'https://fb.me/x',
        imagenUrl: null,
        fecha: '2026-08-01T00:00:00Z',
      },
    });

    expect(vieja?.titular).toBe('Promo Rinoplastia');
    expect(vieja?.saludo).toBeUndefined();
    expect(vieja?.mediaTipo).toBeUndefined();
    expect(vieja?.imagenUrl).toBeUndefined();
  });

  it('lee un chat nuevo con el contexto completo', () => {
    const nueva = campanaOrigenDe({
      campanaOrigen: {
        titular: 'Botox 50U',
        anuncioId: '999',
        cuerpo: 'Promoción de septiembre',
        imagenUrl: 'https://fb.cdn/thumb.jpg',
        mediaTipo: 'video',
        saludo: 'Hola, quiero información',
        clickId: 'Aff-n8ZTODiE',
      },
    });

    expect(nueva).toEqual({
      titular: 'Botox 50U',
      anuncioId: '999',
      cuerpo: 'Promoción de septiembre',
      origenUrl: undefined,
      imagenUrl: 'https://fb.cdn/thumb.jpg',
      mediaTipo: 'video',
      saludo: 'Hola, quiero información',
    });
  });

  it('el `clickId` NO sale a la vista: es para atribución, no para leerlo', () => {
    const c = campanaOrigenDe({ campanaOrigen: { titular: 'X', clickId: 'Aff-secreto' } });
    expect(JSON.stringify(c)).not.toContain('Aff-secreto');
  });

  it('una cadena vacía cuenta como ausente, no como dato', () => {
    const c = campanaOrigenDe({ campanaOrigen: { titular: 'X', cuerpo: '', saludo: '' } });
    expect(c?.cuerpo).toBeUndefined();
    expect(c?.saludo).toBeUndefined();
  });

  it('un tipo inesperado en un campo no rompe la lectura del resto', () => {
    const c = campanaOrigenDe({
      campanaOrigen: { titular: 'X', cuerpo: 42, imagenUrl: { url: 'nope' }, saludo: ['a'] },
    });

    expect(c?.titular).toBe('X');
    expect(c?.cuerpo).toBeUndefined();
    expect(c?.imagenUrl).toBeUndefined();
    expect(c?.saludo).toBeUndefined();
  });
});
