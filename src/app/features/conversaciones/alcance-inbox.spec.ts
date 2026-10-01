import { describe, expect, it } from 'vitest';

import { AlcanceInbox, alcanceDeOpcion, filtrosDeAlcance, opcionDeAlcance } from './conversacion.model';

const ANA = '6f1c2a8e-0b7d-4c1e-9a54-3f2d8e6b1c90';

describe('alcance del inbox (a quién mira un admin)', () => {
  it.each<AlcanceInbox>(['EQUIPO', 'MIOS', { agenteId: ANA }])('el selector ida y vuelta conserva %j', alcance => {
    expect(alcanceDeOpcion(opcionDeAlcance(alcance))).toEqual(alcance);
  });

  it('un valor vacío es el equipo, nunca la agente «»', () => {
    expect(alcanceDeOpcion('')).toBe('EQUIPO');
  });

  /* Eran dos controles y se podían encender a la vez: «los de Ana que además
     son míos o del pool», que casi siempre daba vacío. Ahora no se puede pedir. */
  it('«solo míos» y una agente nunca viajan juntos', () => {
    expect(filtrosDeAlcance('EQUIPO')).toEqual({ agenteId: null, soloMios: false });
    expect(filtrosDeAlcance('MIOS')).toEqual({ agenteId: null, soloMios: true });
    expect(filtrosDeAlcance({ agenteId: ANA })).toEqual({ agenteId: ANA, soloMios: false });
  });
});
