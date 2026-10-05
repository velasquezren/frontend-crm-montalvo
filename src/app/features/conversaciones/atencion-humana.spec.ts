import { describe, expect, it } from 'vitest';

import { ACCION_ATENCION, iconoDeAtencion, MOTIVO_ATENCION, MOTIVO_ATENCION_CORTO, varianteDeAtencion } from './atencion-humana';

describe('etiquetas de la atención humana', () => {
  it('la emergencia se distingue por forma, no solo por color', () => {
    expect(iconoDeAtencion('CRITICA')).toBe('alert-circle');
    expect(iconoDeAtencion('ALTA')).toBe('user');
    expect(iconoDeAtencion('NORMAL')).toBe('user');
  });

  it('el negro es solo de la emergencia: pedir persona y una revisión se ven distintos', () => {
    expect(varianteDeAtencion('CRITICA')).toBe('critical');
    expect(varianteDeAtencion('ALTA')).toBe('success');
    expect(varianteDeAtencion('NORMAL')).toBe('info');
  });

  it('dice que la emergencia la declaró ella, sin afirmar que el CRM la evaluó', () => {
    expect(MOTIVO_ATENCION.EMERGENCIA).toBe('Indicó una emergencia');
    expect(MOTIVO_ATENCION_CORTO.EMERGENCIA).toBe('Emergencia');
    expect(ACCION_ATENCION.EMERGENCIA).toContain('el CRM no evalúa');
  });
});
