import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { API_URL } from '../../core/api/api.constants';
import { AuthService } from '../../core/auth/auth.service';
import { ConversacionThreadComponent } from './components/conversacion-thread/conversacion-thread.component';
import { ConversacionDetalle, ConversacionResumen, MensajeApi, PaginaInbox } from './conversacion.model';
import { ConversacionesStateService } from './services/conversaciones-state.service';

/**
 * R2.2 — reintentar un adjunto sin volver a subirlo ni duplicarlo.
 *
 * Hasta ahora el botón de reintento se escondía cuando el mensaje llevaba
 * media, y el handler cortaba en seco si veía `mediaKey`. No era una
 * limitación de los datos —el globo conserva clave, mime y nombre desde que se
 * pinta— sino que el reintento llamaba a `enviarMensaje()` con el adjunto en
 * `undefined`: el mensaje habría salido sin su imagen.
 *
 * Lo que fijan estas pruebas: el reintento repite la MISMA intención —misma
 * `clientMessageId`, misma `mediaKey`— sin tocar R2, y en particular sin
 * volver a llamar a `/memoria-agente/upload`, porque el archivo ya está en R2
 * desde el primer intento. La idempotencia de R2.1 hace el resto: el servidor
 * devuelve la fila que ya existía y no despacha nada a Meta por segunda vez.
 */

const FECHA = '2026-09-17T15:00:00.000Z';
const CLAVE_IMAGEN = 'memoria/agente-1/1789000000000-ab12.jpg';

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
const DETALLE_A: ConversacionDetalle = { ...FILA_A, mensajes: [mensaje('a-1')] };
const PAGINA: PaginaInbox = {
  datos: [FILA_A], total: 1, pagina: 1, limite: 50, totalPaginas: 1,
  contadores: { total: 1, sinAsignar: 0, misChats: 1, sinResponder: 0 },
};

/** Globo optimista con adjunto, tal como lo deja el compositor. */
function globoConMedia(
  idTemp: string,
  envioLocal: 'ERROR' | 'AMBIGUO' | 'ENVIANDO',
  clientMessageId: string | undefined = 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  clave = CLAVE_IMAGEN,
): MensajeApi {
  return {
    id: idTemp,
    /* Vacío a propósito: es una imagen sin pie de foto, que es el caso que
       antes se corrompía al reintentar. */
    contenido: '',
    direccion: 'SALIENTE', tipo: 'IMAGEN',
    mediaKey: clave, mediaUrl: 'https://r2.example/firmada?exp=1', mediaMime: 'image/jpeg',
    mediaNombre: 'ecografia.jpg',
    estadoEnvio: null, envioLocal, clientMessageId,
    automatico: false, createdAt: FECHA,
  };
}

describe('R2.2 · reintentar un adjunto sin resubirlo', () => {
  let state: ConversacionesStateService;
  let http: HttpTestingController;
  let fixture: ComponentFixture<ConversacionThreadComponent>;

  function responder(ruta: string, respuesta: object): void {
    http.expectOne(req => req.url === `${API_URL}${ruta}`).flush(respuesta);
  }

  const hilo = (): readonly MensajeApi[] => state.detalleActual()?.mensajes ?? [];
  const buscar = (id: string): MensajeApi | undefined => hilo().find(m => m.id === id);

  /** Mete el globo en el hilo y repinta. */
  function pintar(globo: MensajeApi): void {
    const chat = state.detalleActual();
    if (!chat) throw new Error('sin detalle');
    state.detalle.set({ ...chat, mensajes: [...chat.mensajes, globo] });
    fixture.detectChanges();
  }

  /** El botón «Reintentar» del último globo, si existe. */
  function botonReintentar(): HTMLButtonElement | null {
    const botones = Array.from(
      fixture.nativeElement.querySelectorAll('button'),
    ) as HTMLButtonElement[];
    return botones.find(b => b.textContent?.trim() === 'Reintentar') ?? null;
  }

  /** El POST de envío que está en vuelo, o error si no hay exactamente uno. */
  function postDeEnvio() {
    return http.expectOne(
      r => r.method === 'POST' && r.url === `${API_URL}/conversaciones/chat-a/mensajes`,
    );
  }

  function uploadsPedidos(): number {
    return http.match(r => r.url.includes('/memoria-agente/upload')).length;
  }

  beforeEach(async () => {
    TestBed.resetTestingModule();
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    Element.prototype.scrollIntoView = vi.fn();
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
    fixture = TestBed.createComponent(ConversacionThreadComponent);
    fixture.detectChanges();
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

  /* ── 1-5. La intención se repite entera, y nada se vuelve a subir ────── */

  it('1-4 · el reintento reutiliza mediaKey, mediaMime, mediaNombre y clientMessageId', () => {
    pintar(globoConMedia('temp-1', 'ERROR'));
    botonReintentar()?.click();

    const cuerpo = postDeEnvio().request.body as Record<string, unknown>;
    expect(cuerpo['mediaKey']).toBe(CLAVE_IMAGEN);
    expect(cuerpo['mediaMime']).toBe('image/jpeg');
    expect(cuerpo['mediaNombre']).toBe('ecografia.jpg');
    expect(cuerpo['clientMessageId']).toBe('f47ac10b-58cc-4372-a567-0e02b2c3d479');
    /* Sin pie de foto inventado: la imagen se mandó sin texto y así se repite. */
    expect(cuerpo['contenido']).toBe('');
  });

  it('5 · reintentar NO vuelve a subir el archivo', () => {
    pintar(globoConMedia('temp-1', 'ERROR'));
    botonReintentar()?.click();

    expect(uploadsPedidos()).toBe(0);
    postDeEnvio();
  });

  /* ── 6-7. El botón existe y funciona en los dos estados ──────────────── */

  it('6 · ERROR con media ofrece un botón que de verdad envía', () => {
    pintar(globoConMedia('temp-1', 'ERROR'));
    const boton = botonReintentar();
    expect(boton).not.toBeNull();

    boton?.click();
    expect(postDeEnvio()).toBeTruthy();
  });

  it('7 · AMBIGUO con media ofrece un botón que de verdad envía', () => {
    pintar(globoConMedia('temp-1', 'AMBIGUO'));
    const boton = botonReintentar();
    expect(boton).not.toBeNull();

    boton?.click();
    expect(postDeEnvio()).toBeTruthy();
  });

  it('6b · sin clientMessageId no se ofrece botón, porque ahí sí duplicaría', () => {
    /* Un globo de antes de R2.1: sin clave estable, reintentar mandaría un
       segundo WhatsApp real. Se construye quitando el campo, no pasando
       `undefined` al parámetro —eso activaría su valor por defecto—. */
    pintar({ ...globoConMedia('temp-1', 'ERROR'), clientMessageId: undefined });
    expect(botonReintentar()).toBeNull();
  });

  /* ── 8-9. El globo es el mismo de principio a fin ────────────────────── */

  it('8 · al reintentar, el globo vuelve a ENVIANDO', () => {
    pintar(globoConMedia('temp-1', 'ERROR'));
    botonReintentar()?.click();

    expect(buscar('temp-1')?.envioLocal).toBe('ENVIANDO');
    postDeEnvio();
  });

  it('9 · la respuesta reconcilia ESE globo, sin dejar uno de más', async () => {
    pintar(globoConMedia('temp-1', 'ERROR'));
    const antes = hilo().length;
    botonReintentar()?.click();

    postDeEnvio().flush({
      id: 'real-1', direccion: 'SALIENTE', contenido: '', tipo: 'IMAGEN',
      mediaKey: CLAVE_IMAGEN, mediaUrl: 'https://r2.example/nueva', mediaMime: 'image/jpeg',
      mediaNombre: 'ecografia.jpg', estadoEnvio: 'ENVIADO', automatico: false,
      createdAt: '2026-09-17T15:00:09.000Z',
    });

    await vi.waitFor(() => { TestBed.tick(); expect(buscar('real-1')).toBeDefined(); });
    expect(hilo()).toHaveLength(antes);
    expect(buscar('temp-1')).toBeUndefined();
    expect(buscar('real-1')?.envioLocal).toBeUndefined();
    expect(buscar('real-1')?.mediaKey).toBe(CLAVE_IMAGEN);
  });

  /* ── 10-11. La cicatriz de las imágenes duplicadas ───────────────────── */

  it('10 · socket antes que HTTP: el reload trae el real y no queda duplicado', async () => {
    pintar(globoConMedia('temp-1', 'ERROR'));
    botonReintentar()?.click();
    const envio = postDeEnvio();

    /* El aviso por socket llega primero y `detalle.reload()` reemplaza el hilo
       entero — sin saber nada del id temporal, que es puramente local. */
    const real: MensajeApi = {
      id: 'real-1', direccion: 'SALIENTE', contenido: '', tipo: 'IMAGEN',
      mediaKey: CLAVE_IMAGEN, mediaMime: 'image/jpeg', mediaNombre: 'ecografia.jpg',
      estadoEnvio: 'ENVIADO', automatico: false, createdAt: '2026-09-17T15:00:09.000Z',
    };
    state.detalle.set({ ...DETALLE_A, mensajes: [...DETALLE_A.mensajes, real] });

    envio.flush(real);
    await vi.waitFor(() => { TestBed.tick(); expect(buscar('real-1')).toBeDefined(); });

    expect(hilo().filter(m => m.id === 'real-1')).toHaveLength(1);
    expect(hilo().filter(m => m.mediaKey === CLAVE_IMAGEN)).toHaveLength(1);
  });

  it('11 · HTTP antes que socket: tampoco duplica', async () => {
    pintar(globoConMedia('temp-1', 'ERROR'));
    botonReintentar()?.click();

    const real: MensajeApi = {
      id: 'real-1', direccion: 'SALIENTE', contenido: '', tipo: 'IMAGEN',
      mediaKey: CLAVE_IMAGEN, mediaMime: 'image/jpeg', mediaNombre: 'ecografia.jpg',
      estadoEnvio: 'ENVIADO', automatico: false, createdAt: '2026-09-17T15:00:09.000Z',
    };
    postDeEnvio().flush(real);
    await vi.waitFor(() => { TestBed.tick(); expect(buscar('real-1')).toBeDefined(); });

    /* Y ahora el socket: el reload trae la misma fila que ya reconciliamos. */
    state.reconciliarEnvioLocal('chat-a', null, real);

    expect(hilo().filter(m => m.id === 'real-1')).toHaveLength(1);
    expect(hilo().filter(m => m.mediaKey === CLAVE_IMAGEN)).toHaveLength(1);
  });

  /* ── 13. Dos adjuntos son dos intenciones ────────────────────────────── */

  it('13 · dos medias distintas conservan identidades distintas', () => {
    pintar(globoConMedia('temp-1', 'ERROR', '11111111-1111-4111-8111-111111111111', 'memoria/a/1.jpg'));
    pintar(globoConMedia('temp-2', 'ERROR', '22222222-2222-4222-8222-222222222222', 'memoria/a/2.jpg'));

    const botones = (Array.from(fixture.nativeElement.querySelectorAll('button')) as HTMLButtonElement[])
      .filter(b => b.textContent?.trim() === 'Reintentar');
    expect(botones).toHaveLength(2);

    botones[0].click();
    botones[1].click();

    const envios = http.match(
      r => r.method === 'POST' && r.url === `${API_URL}/conversaciones/chat-a/mensajes`,
    );
    expect(envios).toHaveLength(2);
    const claves = envios.map(p => (p.request.body as Record<string, unknown>)['clientMessageId']);
    expect(new Set(claves).size).toBe(2);
    const medias = envios.map(p => (p.request.body as Record<string, unknown>)['mediaKey']);
    expect(new Set(medias).size).toBe(2);
  });

  it('13b · un reintento de texto sigue yendo sin campos de media', () => {
    pintar({
      id: 'temp-txt', contenido: 'Buenos días', direccion: 'SALIENTE', tipo: 'TEXTO',
      estadoEnvio: null, envioLocal: 'ERROR', automatico: false, createdAt: FECHA,
      clientMessageId: '33333333-3333-4333-8333-333333333333',
    });
    botonReintentar()?.click();

    const cuerpo = postDeEnvio().request.body as Record<string, unknown>;
    expect(cuerpo['contenido']).toBe('Buenos días');
    expect(cuerpo['mediaKey']).toBeUndefined();
    expect(cuerpo['clientMessageId']).toBe('33333333-3333-4333-8333-333333333333');
  });
});
