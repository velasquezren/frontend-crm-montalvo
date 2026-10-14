import { describe, expect, it } from 'vitest';

import { ACCION_ATENCION, iconoDeAtencion, MOTIVO_ATENCION, MOTIVO_ATENCION_CORTO, quienAtiende, RAZON_ASISTENTE, textosDeAtencion, varianteDeAtencion } from './atencion-humana';

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
    expect(MOTIVO_ATENCION.EMERGENCIA).toBe('Dice que es una emergencia');
    expect(MOTIVO_ATENCION_CORTO.EMERGENCIA).toBe('Emergencia');
    expect(ACCION_ATENCION.EMERGENCIA).toContain('el CRM no evalúa');
  });

  it('si la pasó la IA, manda la causa concreta; sin causa, el motivo', () => {
    expect(textosDeAtencion({ motivo: 'DERIVADA_ASISTENTE', razonAsistente: 'FALLO' })).toEqual(RAZON_ASISTENTE.FALLO);
    expect(textosDeAtencion({ motivo: 'DERIVADA_ASISTENTE', razonAsistente: null })).toEqual({
      titulo: MOTIVO_ATENCION.DERIVADA_ASISTENTE, accion: ACCION_ATENCION.DERIVADA_ASISTENTE,
    });
    expect(textosDeAtencion({ motivo: 'COMPROBANTE_PAGO' }).titulo).toBe('Mandó un comprobante de pago');
  });

  it('quién la atiende: «La atiendes tú» si soy yo, el primer nombre si es otra', () => {
    expect(quienAtiende({ id: 'u1', nombre: 'Rosa Mamani' }, 'u1')).toBe('La atiendes tú');
    expect(quienAtiende({ id: 'u2', nombre: 'Ana Pérez' }, 'u1')).toBe('Ana la atiende');
  });
});
