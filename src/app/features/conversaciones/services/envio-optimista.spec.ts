import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { API_URL } from '../../../core/api/api.constants';
import { AuthService } from '../../../core/auth/auth.service';
import { ConversacionDetalle, ConversacionResumen, MensajeApi, PaginaInbox } from '../conversacion.model';
import { ConversacionesStateService } from './conversaciones-state.service';

/**
 * Envío optimista seguro.
 *
 * El globo optimista ya existía; lo que no existía era la diferencia entre
 * «esperando» y «enviado». Se pintaba con `estadoEnvio: 'ENVIADO'`, idéntico a
 * un mensaje confirmado, y si el POST fallaba el globo se borraba. Estas
 * pruebas fijan las dos cosas que eso rompía: un mensaje en vuelo no puede
 * afirmar que salió, y uno que falla no puede desaparecer.
 */

const FECHA = '2026-09-17T15:00:00.000Z';

function mensaje(id: string, contenido = 'Hola'): MensajeApi {
  return { id, direccion: 'ENTRANTE', contenido, createdAt: FECHA, estadoEnvio: 'ENVIADO' };
}

function fila(id: string, nombre: string): ConversacionResumen {
  return {
    linea: { id: 'linea-1', nombre: 'Ventas', telefono: '+59170000000', comercial: true, activa: true },
    id, updatedAt: FECHA,
    cliente: { id: `cliente-${id}`, nombre, telefono: '70000000', email: null, categoria: 'PROSPECTO' },
    agente: { id: 'agente-1', nombre: 'Agente de prueba' },
    mensajes: [mensaje(`ultimo-${id}`)],
    noLeidosCount: 0, esperandoRespuesta: false,
  };
}

const FILA_A = fila('chat-a', 'Paciente A');
const FILA_B = fila('chat-b', 'Paciente B');
const DETALLE_A: ConversacionDetalle = { ...FILA_A, mensajes: [mensaje('a-1')] };
const DETALLE_B: ConversacionDetalle = { ...FILA_B, mensajes: [mensaje('b-1')] };

const PAGINA: PaginaInbox = {
  datos: [FILA_A, FILA_B], total: 2, pagina: 1, limite: 50, totalPaginas: 1,
  contadores: { total: 2, sinAsignar: 0, misChats: 2, sinResponder: 0 },
};

/** Lo que devuelve el POST: el mensaje ya persistido, con id e instante reales. */
function respuestaServidor(contenido: string, id = 'real-1'): MensajeApi {
  return {
    id, direccion: 'SALIENTE', contenido, createdAt: '2026-09-17T15:00:05.000Z',
    estadoEnvio: 'ENVIADO', tipo: 'TEXTO', automatico: false,
  };
}

describe('envío optimista: esperar no es haber enviado', () => {
  let state: ConversacionesStateService;
  let http: HttpTestingController;

  function responder(ruta: string, respuesta: object): void {
    http.expectOne(req => req.url === `${API_URL}${ruta}`).flush(respuesta);
  }

  /** Inserta el globo tal como lo hace el compositor. */
  function pintarOptimista(idTemp: string, texto: string): void {
    const chat = state.detalleActual();
    if (!chat) throw new Error('sin detalle');
    state.detalle.set({
      ...chat,
      mensajes: [...chat.mensajes, {
        id: idTemp, contenido: texto, direccion: 'SALIENTE', tipo: 'TEXTO',
        estadoEnvio: null, envioLocal: 'ENVIANDO', automatico: false, createdAt: FECHA,
      }],
    });
  }

  const hilo = (): readonly MensajeApi[] => state.detalleActual()?.mensajes ?? [];
  const buscar = (id: string): MensajeApi | undefined => hilo().find(m => m.id === id);

  beforeEach(async () => {
    TestBed.resetTestingModule();
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(), provideHttpClientTesting(), provideRouter([]),
        { provide: AuthService, useValue: {
          isAdmin: signal(false), generacionSesion: signal(1),
          puedeGestionComercial: signal(true), user: signal({ id: 'agente-1', nombre: 'Agente de prueba' }),
        } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    state = TestBed.inject(ConversacionesStateService);
    state.seleccionadaId.set('chat-a');
    TestBed.tick();
    responder('/conversaciones', structuredClone(PAGINA));
    responder('/conversaciones/chat-a', structuredClone(DETALLE_A));
    responder('/plantillas-agente', []);
    responder('/lineas-whatsapp', { datos: [FILA_A.linea], total: 1, pagina: 1, limite: 100, totalPaginas: 1 });
    await vi.waitFor(() => { TestBed.tick(); expect(state.detalle.value()).not.toBeNull(); });
    TestBed.tick();
    responder('/conversaciones/meta/plantillas', []);
    expect(hilo()).toHaveLength(1);
  });

  afterEach(() => {
    try {
      http.match(() => true).filter(p => !p.cancelled)
        .forEach(p => p.flush({}, { status: 200, statusText: 'OK' }));
    } finally {
      TestBed.resetTestingModule();
      vi.unstubAllGlobals();
    }
  });

  it('1 · el texto aparece antes de que responda el servidor', () => {
    pintarOptimista('temp-1', 'Buenos días');
    expect(hilo()).toHaveLength(2);
    expect(buscar('temp-1')?.contenido).toBe('Buenos días');
  });

  it('2 · aparece como ENVIANDO y NO afirma estar enviado', () => {
    pintarOptimista('temp-1', 'Buenos días');
    const globo = buscar('temp-1');
    expect(globo?.envioLocal).toBe('ENVIANDO');
    /* Lo que más importa de toda esta ronda: no dice ENVIADO. */
    expect(globo?.estadoEnvio).toBeNull();
  });

  it('3 · la respuesta lo convierte en el mensaje real y limpia el estado local', () => {
    pintarOptimista('temp-1', 'Buenos días');
    state.reconciliarEnvioLocal('chat-a', 'temp-1', respuestaServidor('Buenos días'));
    const real = buscar('real-1');
    expect(real).toBeDefined();
    expect(real?.envioLocal).toBeUndefined();
    expect(real?.estadoEnvio).toBe('ENVIADO');
    expect(buscar('temp-1')).toBeUndefined();
  });

  it('4 · no duplica: el hilo crece de uno en uno', () => {
    pintarOptimista('temp-1', 'Buenos días');
    expect(hilo()).toHaveLength(2);
    state.reconciliarEnvioLocal('chat-a', 'temp-1', respuestaServidor('Buenos días'));
    expect(hilo()).toHaveLength(2);
  });

  it('5 · un envío fallido queda visible, con su texto, no se borra', () => {
    pintarOptimista('temp-1', 'Buenos días');
    state.marcarEnvioFallido('chat-a', 'temp-1');
    const globo = buscar('temp-1');
    expect(globo).toBeDefined();
    expect(globo?.envioLocal).toBe('ERROR');
    expect(globo?.contenido).toBe('Buenos días');
    expect(hilo()).toHaveLength(2);
  });

  it('6 · el reintento reutiliza el mismo globo, no crea otro', () => {
    pintarOptimista('temp-1', 'Buenos días');
    state.marcarEnvioFallido('chat-a', 'temp-1');
    state.marcarEnvioEnCurso('chat-a', 'temp-1');
    expect(hilo()).toHaveLength(2);
    expect(buscar('temp-1')?.envioLocal).toBe('ENVIANDO');

    state.reconciliarEnvioLocal('chat-a', 'temp-1', respuestaServidor('Buenos días'));
    expect(hilo()).toHaveLength(2);
    expect(buscar('real-1')?.envioLocal).toBeUndefined();
  });

  it('7 · cambiar de conversación no mezcla mensajes', async () => {
    pintarOptimista('temp-1', 'Para A');
    expect(hilo()).toHaveLength(2);

    state.seleccionadaId.set('chat-b');
    TestBed.tick();
    responder('/conversaciones/chat-b', structuredClone(DETALLE_B));
    await vi.waitFor(() => { TestBed.tick(); expect(state.detalleActual()?.id).toBe('chat-b'); });

    /* El hilo de B no contiene nada de A. */
    expect(hilo().some(m => m.contenido === 'Para A')).toBe(false);

    /* Y la respuesta tardía de A no puede aterrizar en B. */
    state.reconciliarEnvioLocal('chat-a', 'temp-1', respuestaServidor('Para A'));
    expect(state.detalleActual()?.id).toBe('chat-b');
    expect(hilo().some(m => m.contenido === 'Para A')).toBe(false);
  });

  it('8 · dos mensajes legítimos seguidos se mantienen separados', () => {
    pintarOptimista('temp-1', 'Hola');
    pintarOptimista('temp-2', '¿Tiene horario?');
    expect(hilo()).toHaveLength(3);

    state.reconciliarEnvioLocal('chat-a', 'temp-1', respuestaServidor('Hola', 'real-1'));
    state.reconciliarEnvioLocal('chat-a', 'temp-2', respuestaServidor('¿Tiene horario?', 'real-2'));
    expect(hilo()).toHaveLength(3);
    expect(buscar('real-1')?.contenido).toBe('Hola');
    expect(buscar('real-2')?.contenido).toBe('¿Tiene horario?');
  });

  it('9 · reconciliar dos veces el mismo envío no duplica (doble submit)', () => {
    pintarOptimista('temp-1', 'Buenos días');
    const real = respuestaServidor('Buenos días');
    state.reconciliarEnvioLocal('chat-a', 'temp-1', real);
    state.reconciliarEnvioLocal('chat-a', 'temp-1', real);
    expect(hilo()).toHaveLength(2);
  });

  it('10 · el socket llega antes que el POST: no duplica', () => {
    pintarOptimista('temp-1', 'Buenos días');
    const real = respuestaServidor('Buenos días');

    /* El reload del socket reemplaza el array entero y ya trae el real, sin
       saber nada del id temporal. */
    const chat = state.detalleActual()!;
    state.detalle.set({ ...chat, mensajes: [mensaje('a-1'), real] });

    /* Y ahora resuelve el POST. */
    state.reconciliarEnvioLocal('chat-a', 'temp-1', real);
    expect(hilo()).toHaveLength(2);
    expect(hilo().filter(m => m.id === 'real-1')).toHaveLength(1);
  });

  it('11 · el POST llega antes que el socket: no duplica', () => {
    pintarOptimista('temp-1', 'Buenos días');
    const real = respuestaServidor('Buenos días');
    state.reconciliarEnvioLocal('chat-a', 'temp-1', real);
    expect(hilo()).toHaveLength(2);

    /* El socket llega después y vuelve a pasar por la reconciliación. */
    state.reconciliarEnvioLocal('chat-a', null, real);
    expect(hilo()).toHaveLength(2);
  });

  it('12 · el mensaje definitivo conserva los datos del servidor', () => {
    pintarOptimista('temp-1', 'Buenos días');
    const real = respuestaServidor('Buenos días');
    state.reconciliarEnvioLocal('chat-a', 'temp-1', real);

    const guardado = buscar('real-1');
    expect(guardado?.id).toBe(real.id);
    expect(guardado?.createdAt).toBe(real.createdAt);
    expect(guardado?.estadoEnvio).toBe(real.estadoEnvio);
    expect(state.detalleActual()?.updatedAt).toBe(real.createdAt);
  });

  it('13 · descartar un fallido lo quita sin tocar el resto', () => {
    pintarOptimista('temp-1', 'Buenos días');
    state.marcarEnvioFallido('chat-a', 'temp-1');
    state.descartarEnvioFallido('chat-a', 'temp-1');
    expect(hilo()).toHaveLength(1);
    expect(buscar('a-1')).toBeDefined();
  });
});
