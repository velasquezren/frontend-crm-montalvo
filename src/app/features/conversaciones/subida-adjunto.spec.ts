import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { API_URL } from '../../core/api/api.constants';
import { AuthService } from '../../core/auth/auth.service';
import {
  AdjuntoLocal, ConversacionComposerComponent, describirAdjuntos, esEnlaceInternoDelPortal, MAXIMO_ADJUNTOS, motivoParaRechazarAdjunto, planDeEnvio,
} from './components/conversacion-composer/conversacion-composer.component';
import { ConversacionDetalle, ConversacionResumen, PaginaInbox, MensajeApi } from './conversacion.model';
import { ConversacionesStateService } from './services/conversaciones-state.service';

/**
 * R2.2 — la subida del adjunto, que ocurre ANTES de que exista mensaje.
 *
 * Dos cosas que se comprueban aquí y no en el hilo:
 *
 * 1. El estado «Subiendo archivo…». Vive en el compositor y no en
 *    `envioLocal`, porque durante la subida todavía no hay mensaje: la agente
 *    adjunta, revisa en el modal y solo entonces decide enviar. Una burbuja en
 *    el hilo afirmaría que algo salió cuando aún puede descartarlo.
 *
 * 2. Que cambiar de conversación a mitad de subida NO contamine la siguiente.
 *    Mandarle a la paciente equivocada la ecografía de otra es el peor fallo
 *    posible de este módulo, mucho peor que perder el adjunto — que además no
 *    se pierde: queda en Mi Memoria.
 */

/* La fecha es RELATIVA a ahora, no fija. Con una constante del día en que se
   escribió el test, la ventana de 24 h de WhatsApp se cierra al día siguiente y
   el compositor deja de pintar el formulario: la suite empieza a fallar sola,
   sin que nadie toque el código. Pasó el 2026-09-18. */
const FECHA = new Date(Date.now() - 60_000).toISOString();

function mensaje(id: string): MensajeApi {
  return { id, direccion: 'ENTRANTE', contenido: 'Hola', createdAt: FECHA, estadoEnvio: 'ENVIADO' };
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
  contadores: { total: 2, sinAsignar: 0, misChats: 2, sinResponder: 0, cerradas: 0, esperandoHumano: 0, enAtencion: 0 },
};

/** Lo que el compositor expone y estas pruebas necesitan tocar. */
interface ComposerInterno {
  subirAdjunto(file: File): Promise<void>;
  agregarArchivos(files: readonly File[]): Promise<void>;
  adjuntos(): readonly AdjuntoLocal[];
  subiendoArchivo(): boolean;
  quitarAdjunto(id: string): void;
  confirmarYEnviarMedia(): Promise<void>;
}
const claveDe = (a: AdjuntoLocal | undefined) => (a && !a.subiendo ? a.mediaKey : null);

describe('R2.2 · subida de adjuntos', () => {
  let state: ConversacionesStateService;
  let http: HttpTestingController;
  let fixture: ComponentFixture<ConversacionComposerComponent>;
  let composer: ComposerInterno;

  function responder(ruta: string, respuesta: object): void {
    http.expectOne(req => req.url === `${API_URL}${ruta}`).flush(respuesta);
  }

  const archivo = (nombre = 'ecografia.jpg'): File =>
    new File([new Uint8Array([1, 2, 3])], nombre, { type: 'image/jpeg' });

  const uploadEnVuelo = () =>
    http.expectOne(r => r.method === 'POST' && r.url === `${API_URL}/memoria-agente/upload`);

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
    fixture = TestBed.createComponent(ConversacionComposerComponent);
    fixture.detectChanges();
    composer = fixture.componentInstance as unknown as ComposerInterno;
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

  /* ── SUBIENDO ────────────────────────────────────────────────────────── */

  it('S1 · durante la subida se anuncia el archivo, sin porcentaje', () => {
    void composer.subirAdjunto(archivo());
    fixture.detectChanges();

    expect(composer.subiendoArchivo()).toBe(true);
    /* Ya ocupa su lugar en la bandeja, marcado como subiendo. */
    expect(composer.adjuntos()).toMatchObject([{ subiendo: true, mediaNombre: 'ecografia.jpg' }]);
    const texto = fixture.nativeElement.textContent as string;
    expect(texto).toContain('Subiendo archivo…');
    /* Nada de barras ni "37 %": no tenemos progreso real que contar. */
    expect(texto).not.toMatch(/\d+\s*%/);
    uploadEnVuelo();
  });

  it('S2 · al terminar la subida el anuncio desaparece y queda el adjunto', async () => {
    const subida = composer.subirAdjunto(archivo());
    uploadEnVuelo().flush({
      id: 'rec-1', titulo: 'ecografia.jpg', mediaKey: 'memoria/agente-1/1-a.jpg',
      mediaMime: 'image/jpeg', mediaUrl: 'https://r2.example/firmada',
    });
    await subida;
    fixture.detectChanges();

    expect(composer.subiendoArchivo()).toBe(false);
    expect(claveDe(composer.adjuntos()[0])).toBe('memoria/agente-1/1-a.jpg');
  });

  it('S3 · si la subida falla, no queda ni adjunto ni anuncio colgado', async () => {
    const subida = composer.subirAdjunto(archivo());
    uploadEnVuelo().flush({ message: 'Capacidad agotada' }, { status: 400, statusText: 'Bad Request' });
    await subida;

    expect(composer.subiendoArchivo()).toBe(false);
    expect(composer.adjuntos()).toHaveLength(0);
  });

  it('S4 · mientras sube, el botón de enviar está bloqueado', () => {
    state.mensajeNuevo.set('Le mando la ecografía');
    void composer.subirAdjunto(archivo());
    fixture.detectChanges();

    const enviar = Array.from(fixture.nativeElement.querySelectorAll('button'))
      .find(b => (b as HTMLButtonElement).type === 'submit') as HTMLButtonElement | undefined;
    expect(enviar?.disabled).toBe(true);
    uploadEnVuelo();
  });

  /* ── 12. A → B durante la subida ─────────────────────────────────────── */

  it('12 · empezar en A y cambiar a B: el adjunto NO contamina B', async () => {
    const subida = composer.subirAdjunto(archivo());
    const peticion = uploadEnVuelo();

    /* La agente se va a otra paciente mientras el archivo viaja. */
    state.seleccionadaId.set('chat-b');
    TestBed.tick();
    responder('/conversaciones/chat-b', structuredClone(DETALLE_B));
    await vi.waitFor(() => { TestBed.tick(); expect(state.detalleActual()?.id).toBe('chat-b'); });

    /* Y ahora termina la subida, ya en B. */
    peticion.flush({
      id: 'rec-1', titulo: 'ecografia.jpg', mediaKey: 'memoria/agente-1/1-a.jpg',
      mediaMime: 'image/jpeg', mediaUrl: 'https://r2.example/firmada',
    });
    await subida;
    fixture.detectChanges();

    expect(composer.adjuntos()).toHaveLength(0);
    expect(composer.subiendoArchivo()).toBe(false);
    /* Y desde luego no se mandó nada a B. */
    expect(http.match(r => r.method === 'POST' && r.url.includes('/mensajes'))).toHaveLength(0);
  });

  /* ── 14. Texto y media son intenciones independientes ────────────────── */

  it('14 · un texto en vuelo no bloquea el adjunto, y cada uno lleva su clave', async () => {
    /* Texto primero. */
    state.mensajeNuevo.set('Ya le reviso el estudio');
    const form = fixture.nativeElement.querySelector('form') as HTMLFormElement;
    form.dispatchEvent(new Event('submit'));
    /* Un microtask basta: el POST sale antes del primer `await` del envío.
       Nada de `http.match()` para esperar — CONSUME las peticiones, y la
       aserción de después se encontraría la lista vacía. */
    await Promise.resolve();
    TestBed.tick();

    const envios = http.match(
      r => r.method === 'POST' && r.url === `${API_URL}/conversaciones/chat-a/mensajes`,
    );
    expect(envios.length).toBeGreaterThan(0);
    const cuerpoTexto = envios[0].request.body as Record<string, unknown>;
    expect(cuerpoTexto['contenido']).toBe('Ya le reviso el estudio');
    expect(cuerpoTexto['mediaKey']).toBeUndefined();
    /* La clave de intención existe y es un UUID: sin ella no habría reintento
       seguro, que es toda la base de R2.1. */
    expect(String(cuerpoTexto['clientMessageId'])).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    envios.forEach(p => p.flush({
      id: 'real-txt', direccion: 'SALIENTE', contenido: 'Ya le reviso el estudio',
      tipo: 'TEXTO', estadoEnvio: 'ENVIADO', automatico: false, createdAt: FECHA,
    }));

    /* Y el adjunto sigue pudiéndose preparar sin que el texto estorbe. */
    const subida = composer.subirAdjunto(archivo());
    uploadEnVuelo().flush({
      id: 'rec-1', titulo: 'ecografia.jpg', mediaKey: 'memoria/agente-1/1-a.jpg',
      mediaMime: 'image/jpeg', mediaUrl: 'https://r2.example/firmada',
    });
    await subida;
    expect(claveDe(composer.adjuntos()[0])).toBe('memoria/agente-1/1-a.jpg');
  });

  /* ── Varias imágenes a la vez ────────────────────────────────────────── */

  /** Deja correr las promesas pendientes (subidas y envíos encadenados) sin consumir peticiones. */
  async function asentar(): Promise<void> {
    for (let i = 0; i < 20; i++) await Promise.resolve();
    TestBed.tick();
  }

  const recurso = (n: number) => ({
    id: `rec-${n}`, titulo: `foto-${n}.jpg`, mediaKey: `memoria/agente-1/${n}.jpg`, mediaMime: 'image/jpeg', mediaUrl: `https://r2.example/${n}`,
  });

  it('M1 · varias a la vez: todas ocupan su lugar en el orden elegido aunque terminen de subir al revés', async () => {
    const fotos = [1, 2, 3].map(n => archivo(`foto-${n}.jpg`));
    const subida = composer.agregarArchivos(fotos);
    fixture.detectChanges();
    expect(composer.adjuntos().map(a => a.mediaNombre)).toEqual(['foto-1.jpg', 'foto-2.jpg', 'foto-3.jpg']);
    expect(fixture.nativeElement.textContent).toContain('3 imágenes');

    await asentar();
    const subidas = http.match(r => r.method === 'POST' && r.url === `${API_URL}/memoria-agente/upload`);
    expect(subidas).toHaveLength(3);
    /* Terminan al revés: la bandeja no se reordena. */
    [...subidas].reverse().forEach(p => {
      const n = Number(((p.request.body as FormData).get('titulo') as string).match(/\d/)?.[0]);
      p.flush(recurso(n));
    });
    await subida;
    expect(composer.adjuntos().map(claveDe)).toEqual(['memoria/agente-1/1.jpg', 'memoria/agente-1/2.jpg', 'memoria/agente-1/3.jpg']);
  });

  it('M2 · no pasa del máximo por envío, y lo dice', async () => {
    const fotos = Array.from({ length: MAXIMO_ADJUNTOS + 2 }, (_, i) => archivo(`foto-${i + 1}.jpg`));
    void composer.agregarArchivos(fotos);
    expect(composer.adjuntos()).toHaveLength(MAXIMO_ADJUNTOS);
    /* Una segunda tanda con la bandeja llena no entra. */
    void composer.agregarArchivos([archivo('otra.jpg')]);
    expect(composer.adjuntos()).toHaveLength(MAXIMO_ADJUNTOS);
  });

  it('M3 · quitar una mientras sube: no vuelve al terminar', async () => {
    const subida = composer.agregarArchivos([archivo('foto-1.jpg'), archivo('foto-2.jpg')]);
    composer.quitarAdjunto(composer.adjuntos()[0].id);
    await asentar();
    http.match(r => r.method === 'POST' && r.url === `${API_URL}/memoria-agente/upload`)
      .forEach(p => p.flush(recurso(Number(((p.request.body as FormData).get('titulo') as string).match(/\d/)?.[0]))));
    await subida;
    expect(composer.adjuntos().map(a => a.mediaNombre)).toEqual(['foto-2.jpg']);
  });

  it('M4 · al confirmar sale un mensaje por foto, EN ORDEN y de a uno, con el texto en la primera', async () => {
    const subida = composer.agregarArchivos([1, 2, 3].map(n => archivo(`foto-${n}.jpg`)));
    await asentar();
    http.match(r => r.method === 'POST' && r.url === `${API_URL}/memoria-agente/upload`)
      .forEach(p => p.flush(recurso(Number(((p.request.body as FormData).get('titulo') as string).match(/\d/)?.[0]))));
    await subida;
    state.mensajeNuevo.set('Sus fotos del estudio');

    const envio = composer.confirmarYEnviarMedia();
    await Promise.resolve();
    TestBed.tick();
    /* Tres globos a la vez, en orden, aunque al servidor vayan de a uno. */
    const globos = state.detalleActual()!.mensajes.filter(m => m.envioLocal === 'ENVIANDO');
    expect(globos.map(m => m.mediaKey)).toEqual(['memoria/agente-1/1.jpg', 'memoria/agente-1/2.jpg', 'memoria/agente-1/3.jpg']);
    expect(composer.adjuntos()).toHaveLength(0);

    const cuerpos: Array<Record<string, unknown>> = [];
    for (let n = 1; n <= 3; n++) {
      await asentar();
      const pendientes = http.match(r => r.method === 'POST' && r.url === `${API_URL}/conversaciones/chat-a/mensajes`);
      /* De a uno: el siguiente no sale hasta que respondió el anterior. */
      expect(pendientes).toHaveLength(1);
      const cuerpo = pendientes[0].request.body as Record<string, unknown>;
      cuerpos.push(cuerpo);
      pendientes[0].flush({ id: `real-${n}`, direccion: 'SALIENTE', contenido: cuerpo['contenido'], tipo: 'IMAGEN',
        mediaKey: cuerpo['mediaKey'], estadoEnvio: 'ENVIADO', automatico: false, createdAt: FECHA, clientMessageId: cuerpo['clientMessageId'] });
    }
    await envio;
    expect(cuerpos.map(c => c['mediaKey'])).toEqual(['memoria/agente-1/1.jpg', 'memoria/agente-1/2.jpg', 'memoria/agente-1/3.jpg']);
    expect(cuerpos.map(c => c['contenido'])).toEqual(['Sus fotos del estudio', '', '']);
    /* Cada mensaje es su propia intención: claves distintas. */
    expect(new Set(cuerpos.map(c => c['clientMessageId'])).size).toBe(3);
  });

  it('M5 · si una falla, las siguientes NO salen (llegarían desordenadas) y quedan para reintentar', async () => {
    const subida = composer.agregarArchivos([1, 2, 3].map(n => archivo(`foto-${n}.jpg`)));
    await asentar();
    http.match(r => r.method === 'POST' && r.url === `${API_URL}/memoria-agente/upload`)
      .forEach(p => p.flush(recurso(Number(((p.request.body as FormData).get('titulo') as string).match(/\d/)?.[0]))));
    await subida;

    const envio = composer.confirmarYEnviarMedia();
    await asentar();
    const primero = http.match(r => r.method === 'POST' && r.url === `${API_URL}/conversaciones/chat-a/mensajes`);
    expect(primero).toHaveLength(1);
    primero[0].flush({ message: 'Demasiadas peticiones' }, { status: 429, statusText: 'Too Many Requests' });
    await envio;

    expect(http.match(r => r.method === 'POST' && r.url.endsWith('/mensajes'))).toHaveLength(0);
    const globos = state.detalleActual()!.mensajes.filter(m => m.mediaKey?.startsWith('memoria/agente-1/'));
    /* 429 consta que no salió; las otras dos ni se pidieron: las tres se reintentan sin riesgo. */
    expect(globos.map(m => m.envioLocal)).toEqual(['ERROR', 'ERROR', 'ERROR']);
  });
});

describe('el plan de un envío con varios archivos', () => {
  const listo = (n: number, mime = 'image/jpeg') => ({ id: `${n}`, subiendo: false as const, mediaKey: `k${n}`, mediaMime: mime, mediaNombre: `f${n}` });

  it('un mensaje por archivo y el texto como pie del primero; sin archivos, solo el texto', () => {
    expect(planDeEnvio('Hola', [])).toEqual([{ texto: 'Hola', adjunto: null }]);
    expect(planDeEnvio('Sus fotos', [listo(1), listo(2)]).map(p => [p.texto, p.adjunto?.mediaKey])).toEqual([['Sus fotos', 'k1'], ['', 'k2']]);
  });

  it('dice cuántos y de qué tipo', () => {
    expect(describirAdjuntos([listo(1)])).toBe('1 imagen');
    expect(describirAdjuntos([listo(1), listo(2)])).toBe('2 imágenes');
    expect(describirAdjuntos([listo(1, 'application/pdf')])).toBe('1 PDF');
    expect(describirAdjuntos([listo(1, 'application/pdf'), listo(2, 'application/pdf')])).toBe('2 PDF');
    expect(describirAdjuntos([listo(1), listo(2, 'application/pdf')])).toBe('2 archivos');
  });
});

describe('qué se puede adjuntar, por cualquier camino', () => {
  it('rechaza lo que WhatsApp no manda como foto o documento, la foto de más de 5 MB y el PDF de más de 15', () => {
    expect(motivoParaRechazarAdjunto({ type: 'image/jpeg', size: 1_000 })).toBeNull();
    expect(motivoParaRechazarAdjunto({ type: 'application/pdf', size: 15 * 1024 * 1024 })).toBeNull();
    expect(motivoParaRechazarAdjunto({ type: 'application/pdf', size: 15 * 1024 * 1024 + 1 })).toMatch(/15 MB/);
    expect(motivoParaRechazarAdjunto({ type: 'image/heic', size: 1_000 })).toMatch(/JPG, PNG o WEBP/);
    expect(motivoParaRechazarAdjunto({ type: '', size: 1_000 })).toMatch(/no se puede enviar/);
    expect(motivoParaRechazarAdjunto({ type: 'image/png', size: 5 * 1024 * 1024 + 1 })).toMatch(/5 MB/);
  });

  /* El enlace que una agente mandó el 15/10 en vez del PDF. */
  it('reconoce el enlace interno del portal, que a la paciente no le abre', () => {
    expect(esEnlaceInternoDelPortal('https://resultados.107.175.132.15.nip.io/api/v1/portal/informe/pdf/original')).toBe(true);
    expect(esEnlaceInternoDelPortal('https://resultados.107.175.132.15.nip.io/resultados/dc6f7334-13bd-436e-a0de-1c2d057b8b4d')).toBe(false);
    expect(esEnlaceInternoDelPortal('Le envío su informe')).toBe(false);
  });
});
