import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ApplicationRef, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { API_URL } from '../../../core/api/api.constants';
import { AuthService } from '../../../core/auth/auth.service';
import { ConversacionDetalle, ConversacionResumen, MensajeApi, PaginaInbox } from '../conversacion.model';
import { ConversacionesStateService } from './conversaciones-state.service';

/**
 * Apertura inmediata: al pulsar una conversación la cabecera se pinta con la
 * fila que el listado ya tiene, sin esperar los ~236 ms del viaje al servidor.
 *
 * Lo que estas pruebas protegen no es la velocidad —eso se mide con
 * `performance.measure`, no con una suite— sino las tres formas de romperlo:
 * pintar el hilo de otra paciente, dejar que una respuesta tardía pise una
 * selección más nueva, y volver en silencio a la conversación anterior cuando
 * la nueva falla.
 */

const FECHA = '2026-09-17T15:00:00.000Z';

function mensaje(id: string, contenido: string): MensajeApi {
  return { id, direccion: 'ENTRANTE', contenido, createdAt: FECHA, estadoEnvio: 'ENVIADO' };
}

function fila(id: string, nombre: string, ultimo: string): ConversacionResumen {
  return {
    linea: { id: 'linea-1', nombre: 'Ventas', telefono: '+59170000000', comercial: true, activa: true },
    id, updatedAt: FECHA,
    cliente: { id: `cliente-${id}`, nombre, telefono: '70000000', email: null, categoria: 'PROSPECTO' },
    agente: { id: 'agente-1', nombre: 'Agente de prueba' },
    mensajes: [mensaje(`ultimo-${id}`, ultimo)],
    noLeidosCount: 0, esperandoRespuesta: false,
  };
}

const FILA_A = fila('chat-a', 'Paciente A', 'Último de A');
const FILA_B = fila('chat-b', 'Paciente B', 'Último de B');
const FILA_C = fila('chat-c', 'Paciente C', 'Último de C');

function detalle(base: ConversacionResumen, cuantos: number): ConversacionDetalle {
  return {
    ...base,
    mensajes: Array.from({ length: cuantos }, (_, i) => mensaje(`${base.id}-m${i}`, `Mensaje ${i} de ${base.cliente.nombre}`)),
  };
}

const PAGINA: PaginaInbox = {
  datos: [FILA_A, FILA_B, FILA_C], total: 3, pagina: 1, limite: 50, totalPaginas: 1,
  contadores: { total: 3, sinAsignar: 0, misChats: 3, sinResponder: 0 },
};

describe('apertura inmediata de una conversación', () => {
  let state: ConversacionesStateService;
  let http: HttpTestingController;
  let app: ApplicationRef;

  function responder(ruta: string, respuesta: object): void {
    http.expectOne(req => req.url === `${API_URL}${ruta}`).flush(respuesta);
  }

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
    app = TestBed.inject(ApplicationRef);

    /* Mismo montaje que el spec F07: se arranca ya dentro de una conversación,
       que es de donde se sale siempre al pulsar otra. */
    state.seleccionadaId.set('chat-a');
    TestBed.tick();
    responder('/conversaciones', structuredClone(PAGINA));
    responder('/conversaciones/chat-a', detalle(FILA_A, 3));
    responder('/plantillas-agente', []);
    responder('/lineas-whatsapp', { datos: [FILA_A.linea], total: 1, pagina: 1, limite: 100, totalPaginas: 1 });
    await vi.waitFor(() => { TestBed.tick(); expect(state.detalle.value()).not.toBeNull(); });
    TestBed.tick();
    responder('/conversaciones/meta/plantillas', []);
    await app.whenStable();
    expect(state.conversacionesFiltradas()).toHaveLength(3);
    expect(state.detalleActual()?.mensajes).toHaveLength(3);
    expect(state.detalleEsProvisional()).toBe(false);
  });

  afterEach(() => {
    try {
      /* `httpResource` cancela la petición en vuelo al cambiar la selección:
         esa cancelación ES la protección contra carreras, y una petición
         cancelada no admite `flush`. */
      http.match(() => true)
        .filter(pendiente => !pendiente.cancelled)
        .forEach(pendiente => pendiente.flush({}, { status: 200, statusText: 'OK' }));
    } finally {
      TestBed.resetTestingModule();
      vi.unstubAllGlobals();
    }
  });

  it('pinta la conversación seleccionada en el mismo tick, sin esperar al servidor', () => {
    state.seleccionadaId.set('chat-b');
    TestBed.tick();

    /* Nada ha respondido todavía y la cabecera ya está. */
    expect(state.detalleActual()?.id).toBe('chat-b');
    expect(state.detalleActual()?.cliente.nombre).toBe('Paciente B');
    expect(state.detalleEsProvisional()).toBe(true);
  });

  it('no deja el panel vacío cuando la fila está en el listado', () => {
    state.seleccionadaId.set('chat-a');
    TestBed.tick();
    expect(state.detalleActual()).not.toBeNull();
  });

  it('no muestra mensajes de otra conversación mientras carga', () => {
    /* A viene cargada con sus 3 mensajes desde el montaje. */
    expect(state.detalleActual()?.mensajes).toHaveLength(3);

    /* Se cambia a B: ni un solo mensaje de A puede quedar bajo su cabecera. */
    state.seleccionadaId.set('chat-b');
    TestBed.tick();
    expect(state.detalleActual()?.id).toBe('chat-b');
    expect(state.detalleActual()?.mensajes).toEqual([]);
  });

  it('el hilo provisional va vacío: un solo mensaje se leería como conversación nueva', () => {
    state.seleccionadaId.set('chat-b');
    TestBed.tick();
    /* La fila SÍ trae el último mensaje, pero no se pinta. */
    expect(FILA_B.mensajes).toHaveLength(1);
    expect(state.detalleActual()?.mensajes).toEqual([]);
  });

  it('una respuesta tardía no pisa una selección más nueva', async () => {
    state.seleccionadaId.set('chat-b');
    TestBed.tick();
    const peticionB = http.expectOne(req => req.url === `${API_URL}/conversaciones/chat-b`);

    state.seleccionadaId.set('chat-c');
    TestBed.tick();

    /* Llega B cuando ya se está mirando C. */
    if (!peticionB.cancelled) peticionB.flush(detalle(FILA_B, 5));
    TestBed.tick();

    expect(state.detalleActual()?.id).toBe('chat-c');
    expect(state.detalleActual()?.cliente.nombre).toBe('Paciente C');
  });

  it('A → B → C rápido termina mostrando C', async () => {
    state.seleccionadaId.set('chat-b');
    TestBed.tick();
    state.seleccionadaId.set('chat-c');
    TestBed.tick();

    expect(state.detalleActual()?.id).toBe('chat-c');
    expect(state.detalleActual()?.cliente.nombre).toBe('Paciente C');
  });

  it('un error mantiene la selección y no vuelve a la conversación anterior', async () => {
    expect(state.detalleActual()?.id).toBe('chat-a');

    state.seleccionadaId.set('chat-b');
    TestBed.tick();
    http.expectOne(req => req.url === `${API_URL}/conversaciones/chat-b`)
      .flush('roto', { status: 500, statusText: 'Server Error' });
    await vi.waitFor(() => { TestBed.tick(); expect(state.detalle.error()).toBeTruthy(); });

    /* La selección sigue en B y el panel no resucita a A: la página pinta su
       propia vista de error, que es donde va el reintento. */
    expect(state.seleccionadaId()).toBe('chat-b');
    expect(state.detalleActual()).toBeNull();
    expect(state.detalle.error()).toBeTruthy();
  });

  it('el detalle real reemplaza al provisional cuando llega', async () => {
    state.seleccionadaId.set('chat-b');
    TestBed.tick();
    expect(state.detalleEsProvisional()).toBe(true);
    expect(state.detalleActual()?.mensajes).toEqual([]);

    responder('/conversaciones/chat-b', detalle(FILA_B, 4));
    await vi.waitFor(() => { TestBed.tick(); expect(state.detalleEsProvisional()).toBe(false); });

    expect(state.detalleEsProvisional()).toBe(false);
    expect(state.detalleActual()?.mensajes).toHaveLength(4);
    expect(state.detalleActual()?.cliente.nombre).toBe('Paciente B');
  });

  describe('volver a un chat ya abierto', () => {
    it('se pinta entero al instante con lo último que se vio, sin esqueleto', () => {
      state.seleccionadaId.set('chat-b');
      TestBed.tick();
      state.seleccionadaId.set('chat-a');
      TestBed.tick();

      /* Nada respondió aún para esta vuelta, y A ya está con sus 3 mensajes. */
      expect(state.detalleActual()?.id).toBe('chat-a');
      expect(state.detalleActual()?.mensajes).toHaveLength(3);
      expect(state.detalleEsProvisional()).toBe(false);
      expect(state.detalleEsReal()).toBe(false);
    });

    it('la respuesta fresca reemplaza lo recordado', async () => {
      state.seleccionadaId.set('chat-b');
      TestBed.tick();
      state.seleccionadaId.set('chat-a');
      TestBed.tick();
      responder('/conversaciones/chat-a', detalle(FILA_A, 5));
      await vi.waitFor(() => { TestBed.tick(); expect(state.detalleEsReal()).toBe(true); });
      expect(state.detalleActual()?.mensajes).toHaveLength(5);
    });

    it('si el servidor falla al volver, no muestra lo recordado como si fuera válido', async () => {
      state.seleccionadaId.set('chat-b');
      TestBed.tick();
      state.seleccionadaId.set('chat-a');
      TestBed.tick();
      http.expectOne(req => req.url === `${API_URL}/conversaciones/chat-a`).flush('roto', { status: 500, statusText: 'Server Error' });
      await vi.waitFor(() => { TestBed.tick(); expect(state.detalle.error()).toBeTruthy(); });
      expect(state.detalleActual()).toBeNull();
    });
  });

  it('sin selección no hay detalle', () => {
    state.seleccionadaId.set(null);
    TestBed.tick();
    expect(state.detalleActual()).toBeNull();
    expect(state.detalleEsProvisional()).toBe(false);
  });
});
