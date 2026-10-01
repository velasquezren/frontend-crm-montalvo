import { describe, expect, it } from 'vitest';

import { CATEGORIA_BADGE, origenDeCategoria } from './cliente-categoria.model';

describe('categoría del paciente', () => {
  /* El latón es de Gold y solo de Gold (ver `crm-design-system`). */
  it('solo Gold lleva el sello dorado', () => {
    expect(Object.entries(CATEGORIA_BADGE).filter(([, variante]) => variante === 'gold')).toEqual([['GOLD', 'gold']]);
  });

  it('explica si la categoría es automática o fijada a mano', () => {
    expect(origenDeCategoria(null)).toContain('Automática');
    expect(origenDeCategoria(null)).toContain('$3.500');
    expect(origenDeCategoria('2026-09-30T15:00:00.000Z')).toBe('Fijada a mano el 30 de septiembre de 2026. El cálculo automático no la cambia.');
  });
});
