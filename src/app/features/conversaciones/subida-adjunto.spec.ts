import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { API_URL } from '../../core/api/api.constants';
import { AuthService } from '../../core/auth/auth.service';
import { ConversacionComposerComponent } from './components/conversacion-composer/conversacion-composer.component';
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

const FECHA = '2026-09-17T15:00:00.000Z';

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
  contadores: { total: 2, sinAsignar: 0, misChats: 2, sinResponder: 0 },
};

/** Lo que el compositor expone y estas pruebas necesitan tocar. */
interface ComposerInterno {
  subirAdjunto(file: File): Promise<void>;
  adjuntoPendiente(): { mediaKey: string } | null;
  subiendoArchivo(): string | null;
}

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

    expect(composer.subiendoArchivo()).toBe('ecografia.jpg');
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

    expect(composer.subiendoArchivo()).toBeNull();
    expect(composer.adjuntoPendiente()?.mediaKey).toBe('memoria/agente-1/1-a.jpg');
  });

  it('S3 · si la subida falla, no queda ni adjunto ni anuncio colgado', async () => {
    const subida = composer.subirAdjunto(archivo());
    uploadEnVuelo().flush({ message: 'Capacidad agotada' }, { status: 400, statusText: 'Bad Request' });
    await subida;

    expect(composer.subiendoArchivo()).toBeNull();
    expect(composer.adjuntoPendiente()).toBeNull();
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

    expect(composer.adjuntoPendiente()).toBeNull();
    expect(composer.subiendoArchivo()).toBeNull();
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
    expect(composer.adjuntoPendiente()?.mediaKey).toBe('memoria/agente-1/1-a.jpg');
  });
});
