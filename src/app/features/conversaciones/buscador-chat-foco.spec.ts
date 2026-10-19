import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { API_URL } from '../../core/api/api.constants';
import { AuthService } from '../../core/auth/auth.service';
import { ConversacionThreadComponent } from './components/conversacion-thread/conversacion-thread.component';
import { ConversacionDetalle, ConversacionResumen, PaginaInbox } from './conversacion.model';
import { ConversacionesStateService } from './services/conversaciones-state.service';

/**
 * El buscador del chat movía el foco con el atributo `autofocus`, que el
 * navegador aplica una sola vez por documento: desde la segunda búsqueda el
 * campo aparecía sin foco. Y al cerrarlo, la lupa que había abierto la
 * búsqueda ya no existía, así que el foco caía al `<body>`.
 */

const FECHA = new Date(Date.now() - 60_000).toISOString();

const FILA: ConversacionResumen = {
  linea: { id: 'linea-1', nombre: 'Ventas', telefono: '+59170000000', comercial: true, activa: true },
  id: 'chat-a', updatedAt: FECHA,
  cliente: { id: 'cliente-a', nombre: 'Paciente A', telefono: '70000000', email: null, categoria: 'PROSPECTO' },
  agente: { id: 'agente-1', nombre: 'Agente de prueba' },
  mensajes: [{ id: 'm-1', direccion: 'ENTRANTE', contenido: 'Hola', createdAt: FECHA, estadoEnvio: 'ENVIADO' }],
  noLeidosCount: 0, esperandoRespuesta: false,
};
const DETALLE: ConversacionDetalle = { ...FILA };
const PAGINA: PaginaInbox = {
  datos: [FILA], total: 1, pagina: 1, limite: 50, totalPaginas: 1,
  contadores: { total: 1, sinAsignar: 0, misChats: 1, sinResponder: 0, cerradas: 0, esperandoHumano: 0, enAtencion: 0 },
};

describe('buscador del chat · foco', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<ConversacionThreadComponent>;

  const responder = (ruta: string, respuesta: object): void => {
    http.expectOne(req => req.url === `${API_URL}${ruta}`).flush(respuesta);
  };
  const boton = (nombre: string): HTMLButtonElement | null =>
    fixture.nativeElement.querySelector(`button[aria-label="${nombre}"]`);
  const campo = (): HTMLInputElement | null =>
    fixture.nativeElement.querySelector('input[aria-label="Buscar dentro de esta conversación"]');

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
    const state = TestBed.inject(ConversacionesStateService);
    state.seleccionadaId.set('chat-a');
    TestBed.tick();
    responder('/conversaciones', structuredClone(PAGINA));
    responder('/conversaciones/chat-a', structuredClone(DETALLE));
    responder('/plantillas-agente', []);
    responder('/lineas-whatsapp', { datos: [FILA.linea], total: 1, pagina: 1, limite: 100, totalPaginas: 1 });
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

  it('abrir enfoca el campo, también la segunda vez', async () => {
    for (let vez = 0; vez < 2; vez++) {
      boton('Buscar en esta conversación')?.click();
      await fixture.whenStable();
      expect(document.activeElement).toBe(campo());

      boton('Cerrar búsqueda')?.click();
      await fixture.whenStable();
    }
  });

  it('cerrar devuelve el foco a la lupa, no al body', async () => {
    boton('Buscar en esta conversación')?.click();
    await fixture.whenStable();

    campo()?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await fixture.whenStable();

    expect(campo()).toBeNull();
    expect(document.activeElement).toBe(boton('Buscar en esta conversación'));
  });
});
