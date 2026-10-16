import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { API_URL } from '../../core/api/api.constants';
import { AuthService } from '../../core/auth/auth.service';
import { NotificacionNativaService } from '../../core/notification/notificacion-nativa.service';
import { RealtimeService } from '../../core/realtime/realtime.service';
import { ModoInmersivoService } from '../../core/ui/modo-inmersivo.service';
import { ConversacionesPage } from './conversaciones.page';
import { ConversacionDetalle, ConversacionResumen, MensajeApi, PaginaInbox } from './conversacion.model';
import { ConversacionesStateService } from './services/conversaciones-state.service';

/**
 * Volver a Conversaciones desde otra pantalla trae lo de ahora, no lo de la
 * última visita.
 *
 * El estado es `providedIn: 'root'`: sobrevive a la navegación, pero el socket,
 * el reloj y el respaldo que lo mantienen al día viven en la página. Al volver
 * se pintaba lo viejo —URLs firmadas caducadas, «Hoy» que era ayer— y solo
 * Ctrl+R lo arreglaba (16/10/2026).
 *
 * (Lo que sigue es el comentario de la suite de la que sale este montaje.)
 * El detalle provisional no debe convertir un error en una pantalla usable.
 *
 * La apertura inmediata pinta la fila del listado mientras viaja el detalle.
 * Si esa petición FALLA, el provisional tiene que desaparecer: de lo contrario
 * quedaría una cabecera con el nombre de la paciente, un hilo vacío que parece
 * una conversación sin mensajes, y un compositor invitando a escribir sobre un
 * chat que no se pudo cargar. Estas pruebas miran el DOM, no el estado: es la
 * única forma de demostrar que el compositor no está.
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
const DETALLE_A: ConversacionDetalle = { ...FILA_A, mensajes: [mensaje('a-1'), mensaje('a-2')] };

const PAGINA: PaginaInbox = {
  datos: [FILA_A, FILA_B], total: 2, pagina: 1, limite: 50, totalPaginas: 1,
  contadores: { total: 2, sinAsignar: 0, misChats: 2, sinResponder: 0, cerradas: 0, esperandoHumano: 0, enAtencion: 0 },
};

describe('volver a Conversaciones desde otra pantalla', () => {
  let fixture: ComponentFixture<ConversacionesPage>;
  let state: ConversacionesStateService;
  let http: HttpTestingController;
  let ruta$: BehaviorSubject<ReturnType<typeof convertToParamMap>>;

  function responder(ruta: string, respuesta: object): void {
    http.expectOne(req => req.url === `${API_URL}${ruta}`).flush(respuesta);
  }

  beforeEach(async () => {
    TestBed.resetTestingModule();
    ruta$ = new BehaviorSubject(convertToParamMap({ id: 'chat-a' }));
    if (!Element.prototype.scrollIntoView) {
      Element.prototype.scrollIntoView = () => {};
    }
    vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }));
    TestBed.configureTestingModule({
      imports: [ConversacionesPage],
      providers: [
        provideHttpClient(), provideHttpClientTesting(), provideRouter([]),
        { provide: AuthService, useValue: {
          isAdmin: signal(false), generacionSesion: signal(1),
          puedeGestionComercial: signal(true), user: signal({ id: 'agente-1', nombre: 'Agente de prueba' }),
        } },
        { provide: RealtimeService, useValue: {
          actividad: signal(null), reconectado: signal(0), conectado: signal(true),
        } },
        { provide: NotificacionNativaService, useValue: {
          solicitarPermiso: () => Promise.resolve(), actualizarBadge: () => {}, mostrar: () => {},
        } },
        { provide: ModoInmersivoService, useValue: { activar: () => {}, desactivar: () => {} } },
        { provide: ActivatedRoute, useValue: { queryParamMap: ruta$ } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    state = TestBed.inject(ConversacionesStateService);
    fixture = TestBed.createComponent(ConversacionesPage);

    /* Primera visita: una petición de cada cosa (`expectOne` falla si el
       refresco de la vuelta se colara también aquí y las duplicara). */
    fixture.detectChanges();
    responder('/conversaciones', structuredClone(PAGINA));
    responder('/conversaciones/chat-a', structuredClone(DETALLE_A));
    responder('/plantillas-agente', []);
    responder('/lineas-whatsapp', { datos: [FILA_A.linea], total: 1, pagina: 1, limite: 100, totalPaginas: 1 });
    await vi.waitFor(() => { fixture.detectChanges(); expect(state.detalle.value()).not.toBeNull(); });
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

  it('vuelve a pedir la bandeja y el chat abierto, y pone el reloj en hora', async () => {
    /* La agente se va a Clientes: la página se destruye, el estado no. */
    fixture.destroy();
    state.ahora.set(0);

    fixture = TestBed.createComponent(ConversacionesPage);
    fixture.detectChanges();

    expect(state.ahora()).toBeGreaterThan(0);
    const fresca: MensajeApi = { ...mensaje('a-3'), tipo: 'IMAGEN', mediaUrl: 'https://r2.local/firmada-nueva' };
    responder('/conversaciones', structuredClone(PAGINA));
    responder('/conversaciones/chat-a', { ...structuredClone(DETALLE_A), mensajes: [...DETALLE_A.mensajes, fresca] });
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(state.detalle.value()?.mensajes.at(-1)?.mediaUrl).toBe('https://r2.local/firmada-nueva');
    });
  });
});
