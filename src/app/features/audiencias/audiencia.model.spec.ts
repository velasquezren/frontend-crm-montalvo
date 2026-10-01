import { describe, expect, it } from 'vitest';

import { costoMaximoUsd, MOTIVOS_EXCLUSION, PLAZOS_SIN_CAMPANA } from './audiencia.model';

describe('audiencia', () => {
  it('el costo máximo es elegibles × tarifa, redondeado al centavo', () => {
    expect(costoMaximoUsd(47, 0.055)).toBe(2.59);
    expect(costoMaximoUsd(0, 0.055)).toBe(0);
  });

  /* Una tarifa mal escrita no puede dar un costo que parezca un dato. */
  it('una tarifa inválida no da costo', () => {
    expect(costoMaximoUsd(10, Number.NaN)).toBe(0);
    expect(costoMaximoUsd(10, -1)).toBe(0);
  });

  /* El embudo se pinta en el orden en que el backend lo aplica (`MOTIVOS_EXCLUSION`). */
  it('los motivos van en el orden del backend', () => {
    expect(MOTIVOS_EXCLUSION.map(m => m.motivo)).toEqual(['BAJA_PROMOCIONES', 'SIN_CELULAR', 'CAMPANA_RECIENTE', 'SIN_CONVERSAR']);
  });

  it('el plazo por defecto del backend (30 días) está entre las opciones', () => {
    expect(PLAZOS_SIN_CAMPANA.some(p => p.dias === 30)).toBe(true);
  });
});
