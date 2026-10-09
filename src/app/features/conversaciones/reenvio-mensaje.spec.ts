import { describe, expect, it } from 'vitest';

import { MensajeApi } from './conversacion.model';
import { sePuedeReenviar } from './reenvio-mensaje';

const rechazado = (cambios: Partial<MensajeApi> = {}): MensajeApi => ({
  id: 'm1', direccion: 'SALIENTE', contenido: 'Buenos días', createdAt: '2026-10-09T12:00:00Z',
  estadoEnvio: 'FALLIDO', codigoErrorEnvio: 131042, ...cambios,
});

describe('sePuedeReenviar', () => {
  it('ofrece reenviar lo que la clínica puede resolver: facturación de Meta, la red', () => {
    expect(sePuedeReenviar(rechazado())).toBe(true);
    expect(sePuedeReenviar(rechazado({ codigoErrorEnvio: null }))).toBe(true);
  });

  it.each([131050, 130497, 131026])('no lo ofrece cuando reenviar no arregla nada (%s)', codigo => {
    expect(sePuedeReenviar(rechazado({ codigoErrorEnvio: codigo }))).toBe(false);
  });

  it.each<[string, Partial<MensajeApi>]>([
    ['entregado', { estadoEnvio: 'ENTREGADO' }],
    ['en duda', { estadoEnvio: 'INCIERTO' }],
    ['de la paciente', { direccion: 'ENTRANTE' }],
    ['una plantilla', { plantillaCategoria: 'MARKETING' }],
    ['automático', { automatico: true }],
    ['un globo local que no llegó al servidor', { envioLocal: 'ERROR' }],
    ['una oferta interactiva', { interaccion: { tipo: 'botones', cuerpo: 'Menú' } }],
  ])('no lo ofrece en un mensaje %s', (_caso, cambios) => {
    expect(sePuedeReenviar(rechazado(cambios))).toBe(false);
  });
});
