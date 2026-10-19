import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { API_URL } from '../../core/api/api.constants';
import { AuthService } from '../../core/auth/auth.service';
import { ConversacionComposerComponent } from './components/conversacion-composer/conversacion-composer.component';
import { ConversacionDetalle, ConversacionResumen, MensajeApi, PaginaInbox } from './conversacion.model';
import { ConversacionesStateService } from './services/conversaciones-state.service';

/**
 * «Cupos» en el compositor: abre la agenda en un cajón y lo elegido llega a la
 * caja DEBAJO de lo escrito, sin enviarse. Fuera de las 24 h no se ofrece,
 * igual que «Ubicación»: ahí solo salen plantillas.
 */

/* Relativa a ahora: con una fecha fija la ventana de 24 h se cierra sola al día siguiente. */
const FECHA = new Date(Date.now() - 60_000).toISOString();

function mensaje(id: string): MensajeApi {
  return { id, direccion: 'ENTRANTE', contenido: '¿Hay cupo con la ginecóloga?', createdAt: FECHA, estadoEnvio: 'ENVIADO' };
}

const FILA: ConversacionResumen = {
  linea: { id: 'linea-1', nombre: 'Recepción', telefono: '+59170000000', comercial: false, activa: true },
  id: 'chat-a', updatedAt: FECHA,
  cliente: { id: 'cliente-a', nombre: 'Paciente A', telefono: '70000000', email: null, categoria: 'PROSPECTO' },
  agente: null,
  mensajes: [mensaje('ultimo')],
  noLeidosCount: 0, esperandoRespuesta: true,
};
const DETALLE: ConversacionDetalle = { ...FILA, mensajes: [mensaje('a-1')] };
const PAGINA: PaginaInbox = {
  datos: [FILA], total: 1, pagina: 1, limite: 50, totalPaginas: 1,
  contadores: { total: 1, sinAsignar: 0, misChats: 0, sinResponder: 1, cerradas: 0, esperandoHumano: 0, enAtencion: 0 },
};

interface ComposerInterno {
  insertarCupos(texto: string): void;
}

describe('«Cupos» en el compositor', () => {
  let state: ConversacionesStateService;
  let http: HttpTestingController;
  let fixture: ComponentFixture<ConversacionComposerComponent>;

  const responder = (ruta: string, respuesta: object) =>
    http.expectOne(req => req.url === `${API_URL}${ruta}`).flush(respuesta);
  const botonCupos = () =>
    Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button'))
      .find(b => b.textContent?.trim() === 'Cupos') as HTMLButtonElement | undefined;
  const cajon = () => document.querySelector('app-cupos-medico');

  beforeEach(async () => {
    TestBed.resetTestingModule();
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    Element.prototype.scrollIntoView = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(), provideHttpClientTesting(), provideRouter([]),
        { provide: AuthService, useValue: {
          isAdmin: signal(false), generacionSesion: signal(1),
          puedeGestionComercial: signal(false), user: signal({ id: 'recepcion-1', nombre: 'Recepción' }),
        } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    state = TestBed.inject(ConversacionesStateService);
    state.seleccionadaId.set('chat-a');
    TestBed.tick();
    responder('/conversaciones', structuredClone(PAGINA));
    responder('/conversaciones/chat-a', structuredClone(DETALLE));
    responder('/plantillas-agente', []);
    responder('/lineas-whatsapp', { datos: [FILA.linea], total: 1, pagina: 1, limite: 100, totalPaginas: 1 });
    await vi.waitFor(() => { TestBed.tick(); expect(state.detalle.value()).not.toBeNull(); });
    TestBed.tick();
    responder('/conversaciones/meta/plantillas', []);
    fixture = TestBed.createComponent(ConversacionComposerComponent);
    fixture.detectChanges();
  });

  afterEach(() => {
    try {
      http.match(() => true).filter(p => !p.cancelled)
        .forEach(p => p.flush({}, { status: 200, statusText: 'OK' }));
    } finally {
      fixture?.destroy();
      TestBed.resetTestingModule();
      vi.unstubAllGlobals();
    }
  });

  it('abre el cajón de la agenda sin pedir nada hasta que se busca un médico', () => {
    const boton = botonCupos()!;
    expect(boton.disabled).toBe(false);
    boton.click();
    fixture.detectChanges();
    expect(cajon()).not.toBeNull();
    expect(document.body.textContent).toContain('Cupos de un médico');
    http.expectNone(r => r.url.includes('/agenda/'));
  });

  it('lo elegido va debajo del borrador, sin pisarlo ni enviarlo, y el cajón se cierra', async () => {
    botonCupos()!.click();
    fixture.detectChanges();
    state.mensajeNuevo.set('Buenos días, señora.  ');

    (fixture.componentInstance as unknown as ComposerInterno).insertarCupos('Tenemos estos horarios disponibles…');
    fixture.detectChanges();
    await Promise.resolve();

    expect(state.mensajeNuevo()).toBe('Buenos días, señora.\n\nTenemos estos horarios disponibles…');
    expect(cajon()).toBeNull();
    /* Solo el «escribiendo…» de tener texto en la caja (`/leido`), como al teclear: ningún envío. */
    http.expectNone(r => r.method === 'POST' && !r.url.endsWith('/conversaciones/chat-a/leido'));
  });

  it('con la caja vacía el texto queda solo', () => {
    (fixture.componentInstance as unknown as ComposerInterno).insertarCupos('Tenemos un horario disponible…');
    expect(state.mensajeNuevo()).toBe('Tenemos un horario disponible…');
  });

  it('fuera de la ventana de 24 h no se ofrece: solo se pueden enviar plantillas', () => {
    state.ahora.set(Date.now() + 25 * 3_600_000);
    fixture.detectChanges();
    const boton = botonCupos()!;
    expect(boton.disabled).toBe(true);
    boton.click();
    fixture.detectChanges();
    expect(cajon()).toBeNull();
  });
});
