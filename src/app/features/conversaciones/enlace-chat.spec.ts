import { describe, expect, it } from 'vitest';

import { ConversacionResumen } from './conversacion.model';
import { resolverChatDePaciente } from './enlace-chat';

const chat = (id: string, telefono: string) => ({ id, cliente: { telefono } }) as unknown as ConversacionResumen;

describe('resolverChatDePaciente', () => {
  it('abre el chat de la paciente aunque el número venga con otro formato', () => {
    expect(resolverChatDePaciente([chat('a', '+59170012345')], '591 700 12345')).toEqual({ tipo: 'UNO', id: 'a' });
  });

  it('no abre el de otra persona cuyo número contiene los mismos dígitos', () => {
    expect(resolverChatDePaciente([chat('a', '+591700123456')], '+59170012345')).toEqual({ tipo: 'NINGUNO' });
  });

  it('con chats en varias líneas deja elegir', () => {
    expect(resolverChatDePaciente([chat('a', '+59170012345'), chat('b', '+59170012345')], '+59170012345')).toEqual({ tipo: 'VARIOS' });
  });
});
