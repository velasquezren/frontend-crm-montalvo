import { describe, expect, it } from 'vitest';

import type { MensajeApi } from './conversacion.model';
import { continuaTanda, firmaDeAutor, horaDeFila } from './presentacion-chat';

const ANA = { id: 'ana', nombre: 'Ana María Pérez' };
const BEA = { id: 'bea', nombre: 'Bea Rojas' };

function msg(parcial: Partial<MensajeApi> & Pick<MensajeApi, 'createdAt'>): MensajeApi {
  return { id: Math.random().toString(36), direccion: 'SALIENTE', contenido: 'x', ...parcial };
}

describe('horaDeFila', () => {
  const ahora = new Date(2026, 9, 14, 16, 30); // miércoles 14/10/2026

  it('hoy dice la hora, no «3h»', () => {
    expect(horaDeFila(new Date(2026, 9, 14, 9, 5), ahora)).toBe('09:05');
  });

  it('cuenta días de calendario: anoche a las 23:50 es «Ayer», aunque hayan pasado menos de 24 h', () => {
    expect(horaDeFila(new Date(2026, 9, 13, 23, 50), ahora)).toBe('Ayer');
  });

  it('esta semana dice el día, con mayúscula', () => {
    expect(horaDeFila(new Date(2026, 9, 10, 12, 0), ahora)).toBe('Sábado');
  });

  it('más viejo, la fecha corta', () => {
    expect(horaDeFila(new Date(2026, 8, 30, 12, 0), ahora)).toBe('30/09/26');
  });
});

describe('continuaTanda', () => {
  it('pega lo de la misma persona dentro de cinco minutos', () => {
    const a = msg({ createdAt: '2026-10-14T10:00:00Z', autor: ANA });
    expect(continuaTanda(a, msg({ createdAt: '2026-10-14T10:04:00Z', autor: ANA }))).toBe(true);
    expect(continuaTanda(a, msg({ createdAt: '2026-10-14T10:06:00Z', autor: ANA }))).toBe(false);
  });

  it('otra persona del equipo, la paciente, el asistente o el CRM empiezan tanda nueva', () => {
    const a = msg({ createdAt: '2026-10-14T10:00:00Z', autor: ANA });
    const luego = '2026-10-14T10:01:00Z';
    expect(continuaTanda(a, msg({ createdAt: luego, autor: BEA }))).toBe(false);
    expect(continuaTanda(a, msg({ createdAt: luego, direccion: 'ENTRANTE' }))).toBe(false);
    expect(continuaTanda(a, msg({ createdAt: luego, automatico: true, asistente: true }))).toBe(false);
    expect(continuaTanda(a, msg({ createdAt: luego, automatico: true }))).toBe(false);
  });

  it('dos mensajes seguidos de la paciente van juntos; el primero nunca continúa nada', () => {
    const p = msg({ createdAt: '2026-10-14T10:00:00Z', direccion: 'ENTRANTE' });
    expect(continuaTanda(p, msg({ createdAt: '2026-10-14T10:00:30Z', direccion: 'ENTRANTE' }))).toBe(true);
    expect(continuaTanda(undefined, p)).toBe(false);
  });
});

describe('firmaDeAutor', () => {
  it('firma con el primer nombre lo que escribió otra persona', () => {
    expect(firmaDeAutor(ANA, 'bea')).toBe('Ana');
  });

  it('lo propio, lo automático y lo anterior al autor no se firman', () => {
    expect(firmaDeAutor(ANA, 'ana')).toBeNull();
    expect(firmaDeAutor(null, 'ana')).toBeNull();
    expect(firmaDeAutor(undefined, 'ana')).toBeNull();
  });
});
