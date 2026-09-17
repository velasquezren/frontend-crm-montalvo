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
const DETALLE_B: ConversacionDetalle = { ...FILA_B, mensajes: [mensaje('b-1')] };

const PAGINA: PaginaInbox = {
  datos: [FILA_A, FILA_B], total: 2, pagina: 1, limite: 50, totalPaginas: 1,
  contadores: { total: 2, sinAsignar: 0, misChats: 2, sinResponder: 0 },
};

describe('detalle que falla: la página no deja un panel utilizable', () => {
  let fixture: ComponentFixture<ConversacionesPage>;
  let state: ConversacionesStateService;
  let http: HttpTestingController;
  /* La página lee el chat abierto del query param, no de la señal: seleccionar
     desde la prueba significa mover la URL, igual que hace `seleccionar()`. */
  let ruta$: BehaviorSubject<ReturnType<typeof convertToParamMap>>;

  function abrir(id: string | null): void {
    ruta$.next(convertToParamMap(id ? { id } : {}));
    fixture.detectChanges();
  }

  const dom = (): HTMLElement => fixture.nativeElement as HTMLElement;

  function responder(ruta: string, respuesta: object): void {
    http.expectOne(req => req.url === `${API_URL}${ruta}`).flush(respuesta);
  }

  beforeEach(async () => {
    TestBed.resetTestingModule();
    ruta$ = new BehaviorSubject(convertToParamMap({ id: 'chat-a' }));
    /* El hilo hace scroll al último mensaje al pintarse y jsdom no implementa
       `scrollIntoView`. Sin esto la suite pasa igual, pero deja siete errores
       sueltos que esconderían uno de verdad. */
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

    fixture.detectChanges();
    responder('/conversaciones', structuredClone(PAGINA));
    responder('/conversaciones/chat-a', structuredClone(DETALLE_A));
    responder('/plantillas-agente', []);
    responder('/lineas-whatsapp', { datos: [FILA_A.linea], total: 1, pagina: 1, limite: 100, totalPaginas: 1 });
    await vi.waitFor(() => { fixture.detectChanges(); expect(state.detalle.value()).not.toBeNull(); });
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

  async function fallarDetalleDeB(): Promise<void> {
    abrir('chat-b');
    http.expectOne(req => req.url === `${API_URL}/conversaciones/chat-b`)
      .flush('roto', { status: 500, statusText: 'Server Error' });
    await vi.waitFor(() => { fixture.detectChanges(); expect(state.detalle.error()).toBeTruthy(); });
    fixture.detectChanges();
  }

  it('1 · la conversación seleccionada sigue siendo la que se pulsó', async () => {
    await fallarDetalleDeB();
    expect(state.seleccionadaId()).toBe('chat-b');
  });

  it('2 · la vista de error con reintento está en el DOM', async () => {
    await fallarDetalleDeB();
    expect(dom().querySelector('app-error-carga')).not.toBeNull();
  });

  it('3 · el compositor NO está en el DOM', async () => {
    expect(dom().querySelector('app-conversacion-composer')).not.toBeNull();
    await fallarDetalleDeB();
    expect(dom().querySelector('app-conversacion-composer')).toBeNull();
  });

  it('4 · no queda ningún mensaje de la conversación anterior', async () => {
    await fallarDetalleDeB();
    expect(dom().querySelectorAll('[data-mensaje-id]')).toHaveLength(0);
    expect(dom().querySelector('app-conversacion-thread')).toBeNull();
  });

  it('5 · no hay caja de texto ni botón de envío con que mandar nada', async () => {
    await fallarDetalleDeB();
    expect(dom().querySelector('textarea')).toBeNull();
    expect(state.detalleActual()).toBeNull();
  });

  it('6 · al reintentar con éxito aparece el detalle real', async () => {
    await fallarDetalleDeB();
    expect(state.detalle.reload()).toBe(true);
    fixture.detectChanges();
    responder('/conversaciones/chat-b', structuredClone(DETALLE_B));
    await vi.waitFor(() => { fixture.detectChanges(); expect(state.detalle.error()).toBeFalsy(); });
    fixture.detectChanges();

    expect(state.detalleActual()?.id).toBe('chat-b');
    expect(state.detalleEsProvisional()).toBe(false);
    expect(dom().querySelector('app-error-carga')).toBeNull();
    expect(dom().querySelector('app-conversacion-composer')).not.toBeNull();
  });
});
