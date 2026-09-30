import { describe, expect, it } from 'vitest';

import { ContadoresInbox, ConversacionResumen, contadoresTrasResponder, describirCierre, estaSinResponder } from './conversacion.model';

const CONTADORES: ContadoresInbox = { total: 10, sinAsignar: 2, misChats: 5, sinResponder: 4, cerradas: 7 };
const CHAT = {
  id: 'chat-1', updatedAt: '2026-09-30T15:00:00.000Z', esperandoRespuesta: true, cerradaEn: null,
  mensajes: [{ id: 'm1', direccion: 'ENTRANTE', contenido: 'Hola', createdAt: '2026-09-30T15:00:00.000Z' }],
} as unknown as ConversacionResumen;

describe('conversación abierta o cerrada', () => {
  it('una cerrada no está «sin responder», aunque lo último sea de la paciente', () => {
    expect(estaSinResponder(CHAT)).toBe(true);
    expect(estaSinResponder({ ...CHAT, cerradaEn: '2026-09-30T16:00:00.000Z' })).toBe(false);
  });

  it('contestar una abierta solo baja «Sin responder»', () => {
    expect(contadoresTrasResponder(CONTADORES, CHAT)).toEqual({ ...CONTADORES, sinResponder: 3 });
    expect(contadoresTrasResponder(CONTADORES, { ...CHAT, esperandoRespuesta: false })).toBe(CONTADORES);
  });

  it('contestar una cerrada la reabre: sale de «Cerradas» y vuelve a contar como abierta', () => {
    expect(contadoresTrasResponder(CONTADORES, { ...CHAT, cerradaEn: '2026-09-30T16:00:00.000Z' }))
      .toEqual({ ...CONTADORES, cerradas: 6, total: 11 });
  });

  it('la franja dice quién la cerró, o que fue por inactividad, con la fecha de la clínica', () => {
    /* 02:00 UTC del 1-oct = 22:00 del 30-sep en La Paz. */
    expect(describirCierre({ cerradaEn: '2026-10-01T02:00:00.000Z', cerradaPor: { id: 'u', nombre: 'Ana Pérez' } }))
      .toBe('Cerrada por Ana el 30 de septiembre. Se reabre sola si la paciente escribe o si le contestas.');
    expect(describirCierre({ cerradaEn: '2026-10-01T02:00:00.000Z', cerradaPor: null })).toMatch(/^Cerrada por inactividad el 30 de septiembre/);
    expect(describirCierre({ cerradaEn: null, cerradaPor: null })).toBeNull();
  });
});
