import { describe, expect, it } from 'vitest';

import { ContadoresInbox, ConversacionResumen, contadoresTrasResponder, describirCierre, duenaDelChatLibre, estaSinResponder, sinResponderEnPestana } from './conversacion.model';

const CONTADORES: ContadoresInbox = { total: 10, sinAsignar: 2, misChats: 5, sinResponder: 4, cerradas: 7, esperandoHumano: 0, enAtencion: 0 };
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

  it('el número de «Sin responder» es el de la pestaña elegida; en el archivo no hay', () => {
    const c: ContadoresInbox = { ...CONTADORES, sinResponderSinAsignar: 1, sinResponderMisChats: 2, sinResponderAtencion: 0 };
    expect(sinResponderEnPestana(c, 'TODAS')).toBe(4);
    expect(sinResponderEnPestana(c, 'SIN_ASIGNAR')).toBe(1);
    expect(sinResponderEnPestana(c, 'MIS_CHATS')).toBe(2);
    expect(sinResponderEnPestana(c, 'ATENCION')).toBe(0);
    expect(sinResponderEnPestana(c, 'CERRADAS')).toBeNull();
    /* Un backend anterior no los manda: no se inventa un 0. */
    expect(sinResponderEnPestana(CONTADORES, 'MIS_CHATS')).toBeNull();
  });

  it('contestar una de las mías baja su «sin responder» y, con el filtro puesto, también «Mis chats» y «Todas»', () => {
    const c: ContadoresInbox = { ...CONTADORES, sinResponderSinAsignar: 1, sinResponderMisChats: 2, sinResponderAtencion: 0 };
    const mia = { ...CHAT, agente: { id: 'yo', nombre: 'Yo' } } as ConversacionResumen;
    expect(contadoresTrasResponder(c, mia, 'yo')).toEqual({ ...c, sinResponder: 3, sinResponderMisChats: 1 });
    expect(contadoresTrasResponder(c, mia, 'yo', true)).toEqual({ ...c, sinResponder: 3, sinResponderMisChats: 1, misChats: 4, total: 9 });
    const libre = { ...CHAT, agente: null } as ConversacionResumen;
    expect(contadoresTrasResponder(c, libre, 'yo')).toEqual({ ...c, sinResponder: 3, sinResponderSinAsignar: 0 });
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

describe('quién atiende y de quién es la paciente', () => {
  const ANA = { id: 'ana', nombre: 'Ana Pérez' };
  const BETO = { id: 'beto', nombre: 'Beto Rojas' };
  const sinDuena = { ...CHAT, cliente: { ...CHAT.cliente, agente: null } };
  const conDuena = { ...CHAT, cliente: { ...CHAT.cliente, agente: ANA } };

  /* La fila decía «Ana» con el chat en «Sin asignar». Libre, la dueña se dice
     como dueña; con responsable, manda el responsable. */
  it('la dueña solo se menciona cuando el chat está libre', () => {
    expect(duenaDelChatLibre({ ...conDuena, agente: null })).toEqual(ANA);
    expect(duenaDelChatLibre({ ...conDuena, agente: BETO })).toBeNull();
    expect(duenaDelChatLibre({ ...sinDuena, agente: null })).toBeNull();
  });
});
