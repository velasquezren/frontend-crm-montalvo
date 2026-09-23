import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ApplicationRef, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { API_URL } from '../../../core/api/api.constants';
import { AuthService } from '../../../core/auth/auth.service';
import { ConversacionDetalle, MensajeApi, PaginaInbox } from '../conversacion.model';
import { ErrorCanalWhatsapp } from '../validar-canal';
import { ConversacionesStateService } from './conversaciones-state.service';

const FECHA = '2026-09-09T15:00:00.000Z';
const MENSAJE: MensajeApi = {
  id: 'mensaje-1', direccion: 'SALIENTE', contenido: 'Mensaje de prueba',
  createdAt: FECHA, estadoEnvio: 'ENVIADO',
};
const CHAT: ConversacionDetalle = {
  linea: { id: 'linea-1', nombre: 'Ventas', telefono: '+59170000000', comercial: true, activa: true },
  id: 'chat-1', updatedAt: FECHA, mensajes: [MENSAJE],
  cliente: {
    id: 'cliente-1', nombre: 'Paciente de prueba', telefono: '00000000',
    email: null, categoria: 'PROSPECTO', datosExtra: { notaFijada: 'Nota anterior' },
  },
  agente: { id: 'agente-1', nombre: 'Agente de prueba' },
  noLeidosCount: 0, esperandoRespuesta: false,
};
const PAGINA: PaginaInbox = {
  datos: [CHAT], total: 1, pagina: 1, limite: 50, totalPaginas: 1,
  contadores: { total: 1, sinAsignar: 0, misChats: 1, sinResponder: 0 },
};

describe('F07 · sincronización de conversaciones con igual fecha y cantidad', () => {
  let state: ConversacionesStateService;
  let http: HttpTestingController;
  let app: ApplicationRef;

  function responder(ruta: string, respuesta: object): void {
    http.expectOne(req => req.url === `${API_URL}${ruta}`).flush(respuesta);
  }

  async function recargarDetalle(respuesta: ConversacionDetalle): Promise<void> {
    expect(state.detalle.reload()).toBe(true);
    TestBed.tick();
    responder('/conversaciones/chat-1', respuesta);
    await app.whenStable();
  }

  beforeEach(async () => {
    TestBed.resetTestingModule();
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(), provideHttpClientTesting(), provideRouter([]),
        { provide: AuthService, useValue: {
          isAdmin: signal(false),
          generacionSesion: signal(1),
          puedeGestionComercial: signal(true), user: signal({ id: 'agente-1', nombre: 'Agente de prueba' }),
        } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    state = TestBed.inject(ConversacionesStateService);
    app = TestBed.inject(ApplicationRef);
    state.seleccionadaId.set(CHAT.id);
    TestBed.tick();
    responder('/conversaciones', structuredClone(PAGINA));
    responder('/conversaciones/chat-1', structuredClone(CHAT));
    responder('/plantillas-agente', []);
    responder('/lineas-whatsapp', { datos: [CHAT.linea], total: 1, pagina: 1, limite: 100, totalPaginas: 1 });
    await vi.waitFor(() => { TestBed.tick(); expect(state.detalle.value()).not.toBeNull(); });
    TestBed.tick();
    responder('/conversaciones/meta/plantillas', []);
    await app.whenStable();
    // Leer los derivados antes de cambiar la respuesta: también deben invalidarse.
    expect(state.mensajesConFecha().some(item => item.tipo === 'mensaje')).toBe(true);
    expect(state.conversacionesFiltradas()[0].cliente.nombre).toBe(CHAT.cliente.nombre);
  });

  afterEach(() => {
    try {
      http.verify();
    } finally {
      TestBed.resetTestingModule();
      vi.unstubAllGlobals();
    }
  });

  it.each(['ENTREGADO', 'LEIDO', 'FALLIDO'] as const)(
    'actualiza el hilo a %s sin otro mensaje ni cambio de updatedAt', async estadoEnvio => {
      const mensaje = { ...MENSAJE, estadoEnvio };
      await recargarDetalle({ ...CHAT, mensajes: [mensaje] });
      expect(state.detalle.value()?.mensajes).toEqual([mensaje]);
      expect(state.mensajesConFecha().filter(item => item.tipo === 'mensaje'))
        .toEqual([{ tipo: 'mensaje', mensaje }]);
    },
  );

  /* Buscar solo en lo cargado decía «0» para un mensaje de hace un mes que
     existía: un corte leído como dato. Ahora cuenta y lista el servidor. */
  it('el buscador del hilo busca en todo el historial y cuenta el total real', async () => {
    state.buscadorAbierto.set(true);
    state.busquedaChat.set('Receta');
    let peticion: ReturnType<HttpTestingController['expectOne']> | undefined;
    await vi.waitFor(() => {
      TestBed.tick();
      peticion = http.expectOne(req => req.url === `${API_URL}/conversaciones/chat-1/buscar-mensajes`);
    });
    expect(peticion!.request.params.get('query')).toBe('receta');
    peticion!.flush({ total: 73, items: [{ ...MENSAJE, id: 'viejo-1', contenido: 'su receta' }] });
    await app.whenStable();
    expect(state.coincidenciasChat()).toEqual(['viejo-1']);
    expect(state.totalCoincidencias()).toBe(73);
  });

  it('actualiza las plantillas de la línea actual desde Meta y permite repetir tras un error', async () => {
    state.actualizarPlantillasWhatsApp();
    TestBed.tick();
    const peticion = http.expectOne(req => req.url.endsWith('/meta/plantillas') && req.params.get('refresh') === 'true');
    expect(peticion.request.params.get('lineaId')).toBe(CHAT.linea.id);
    peticion.flush({ message: 'Meta no disponible' }, { status: 503, statusText: 'Unavailable' });
    await app.whenStable();
    expect(state.plantillasWhatsApp.error()).toBeTruthy();
    state.actualizarPlantillasWhatsApp();
    TestBed.tick();
    http.expectOne(req => req.url.endsWith('/meta/plantillas') && req.params.get('refresh') === 'true').flush([]);
    await app.whenStable();
    expect(state.plantillasWhatsApp.error()).toBeUndefined();
    expect(state.plantillasWhatsApp.value()).toEqual([]);
  });

  it('muestra el archivo cuando termina su descarga y renueva su URL firmada', async () => {
    const pendiente: MensajeApi = {
      ...MENSAJE, direccion: 'ENTRANTE', tipo: 'IMAGEN', mediaUrl: null,
    };
    await recargarDetalle({ ...CHAT, mensajes: [pendiente] });
    const disponible = {
      ...pendiente, mediaKey: 'wa/prueba/imagen', mediaMime: 'image/png',
      mediaNombre: 'prueba.png', mediaUrl: 'https://media.example/prueba?firma=1',
    };
    await recargarDetalle({ ...CHAT, mensajes: [disponible] });
    expect(state.detalle.value()?.mensajes[0]).toEqual(disponible);
    const renovado = { ...disponible, mediaUrl: 'https://media.example/prueba?firma=2' };
    await recargarDetalle({ ...CHAT, mensajes: [renovado] });
    expect(state.mensajesConFecha().filter(item => item.tipo === 'mensaje'))
      .toEqual([{ tipo: 'mensaje', mensaje: renovado }]);
  });

  it('actualiza nombre, ficha y nota fijada aunque no cambie la conversación', async () => {
    const cliente = {
      ...CHAT.cliente, nombre: 'Nombre corregido', email: 'prueba@example.com',
      datosExtra: { notaFijada: 'Nota corregida', tags: ['Seguimiento'] },
    };
    await recargarDetalle({ ...CHAT, cliente });
    expect(state.detalle.value()?.cliente).toEqual(cliente);
    state.iniciarEdicionFicha();
    expect(state.editNombre()).toBe(cliente.nombre);
    expect(state.editEmail()).toBe(cliente.email);
    expect(state.editTags()).toBe('Seguimiento');
  });

  it('acepta un cambio de agente con igual timestamp', async () => {
    await recargarDetalle({ ...CHAT, agente: null });
    expect(state.detalle.value()?.agente).toBeNull();
  });

  it('refresca nombre, agente y último mensaje en la primera página por HTTP', async () => {
    const fila = {
      ...CHAT, cliente: { ...CHAT.cliente, nombre: 'Nombre corregido' },
      agente: { id: 'agente-2', nombre: 'Otra agente' },
      mensajes: [{ ...MENSAJE, estadoEnvio: 'LEIDO' as const }],
    };
    expect(state.inbox.reload()).toBe(true);
    TestBed.tick();
    responder('/conversaciones', { ...PAGINA, datos: [fila] });
    await app.whenStable();
    expect(state.conversacionesFiltradas()).toEqual([fila]);
  });

  it('aplica el resumen realtime si la fila ya está primera y solo cambia su entrega', async () => {
    const fila = { ...CHAT, mensajes: [{ ...MENSAJE, estadoEnvio: 'ENTREGADO' as const }] };
    const refresco = state.refrescarFilaPorRealtime(CHAT.id);
    responder('/conversaciones/chat-1/resumen', { conversacion: fila, contadores: PAGINA.contadores });
    await refresco;
    expect(state.conversacionesFiltradas()).toEqual([fila]);
  });

  it('actualiza el contador total aunque los otros contadores y filas no cambien', async () => {
    expect(state.stats().total).toBe(1);
    const refresco = state.refrescarFilaPorRealtime(CHAT.id);
    responder('/conversaciones/chat-1/resumen', {
      conversacion: CHAT, contadores: { ...PAGINA.contadores, total: 2 },
    });
    await refresco;
    expect(state.stats().total).toBe(2);
  });

  it('reemplaza el ID optimista por el real aun con la misma fecha y cantidad', () => {
    state.detalle.set({ ...CHAT, mensajes: [{ ...MENSAJE, id: 'optimista-1' }] });
    expect(state.detalle.value()?.mensajes[0].id).toBe('optimista-1');
    state.reconciliarEnvioLocal(CHAT.id, 'optimista-1', MENSAJE);
    expect(state.detalle.value()?.mensajes).toEqual([MENSAJE]);
  });

  it('conserva una sola copia si realtime confirmó el mensaje antes del POST', async () => {
    await recargarDetalle({ ...CHAT, mensajes: [MENSAJE] });
    state.reconciliarEnvioLocal(CHAT.id, 'optimista-1', MENSAJE);
    expect(state.detalle.value()?.mensajes).toEqual([MENSAJE]);
  });
  it('descarta un resumen tardío de la línea anterior y limpia el borrador', async () => {
    state.mensajeNuevo.set('Borrador de ventas');
    const pendiente = state.refrescarFilaPorRealtime(CHAT.id);
    state.cambiarLinea('linea-2');
    responder('/conversaciones/chat-1/resumen', { conversacion: CHAT, contadores: PAGINA.contadores });
    await pendiente;
    TestBed.tick();
    responder('/conversaciones', { ...PAGINA, datos: [], total: 0, contadores: { total: 0, misChats: 0, sinAsignar: 0, sinResponder: 0 } });
    await app.whenStable();
    expect(state.detalle.value()).toBeNull();
    expect(state.conversacionesFiltradas()).toEqual([]);
    expect(state.mensajeNuevo()).toBe('');
  });

  it('cambiar de sesión elimina el chat y descarta respuestas del usuario anterior', async () => {
    const pendiente = state.refrescarFilaPorRealtime(CHAT.id);
    const auth = TestBed.inject(AuthService) as unknown as { generacionSesion: { set: (v: number) => void } };
    auth.generacionSesion.set(2);
    TestBed.tick();
    responder('/conversaciones/chat-1/resumen', { conversacion: CHAT, contadores: PAGINA.contadores });
    await pendiente;
    responder('/conversaciones', { ...PAGINA, datos: [], total: 0, contadores: { total: 0, misChats: 0, sinAsignar: 0, sinResponder: 0 } });
    responder('/lineas-whatsapp', { datos: [], total: 0, pagina: 1, limite: 100, totalPaginas: 1 });
    await app.whenStable();
    expect(state.seleccionadaId()).toBeNull();
    expect(state.detalle.value()).toBeNull();
    expect(state.conversacionesFiltradas()).toEqual([]);
  });

  it.each([undefined, null])('rechaza una bandeja sin línea (%s) y se recupera al reintentar', async linea => {
    state.inbox.reload();
    TestBed.tick();
    responder('/conversaciones', { ...PAGINA, datos: [{ ...CHAT, linea }] });
    await app.whenStable();
    expect(state.inbox.error()).toBeInstanceOf(ErrorCanalWhatsapp);
    expect(state.conversacionesFiltradas()).toEqual([]);
    expect(state.stats().total).toBe(0);
    expect(state.errorInbox()).toContain('identificar la línea');

    state.inbox.reload();
    TestBed.tick();
    responder('/conversaciones', structuredClone(PAGINA));
    await app.whenStable();
    expect(state.inbox.error()).toBeUndefined();
    expect(state.conversacionesFiltradas()).toEqual([CHAT]);
  });

  it('impide usar el detalle sin canal y mantiene los derivados seguros', async () => {
    state.detalle.reload();
    TestBed.tick();
    responder('/conversaciones/chat-1', { ...CHAT, linea: undefined });
    await app.whenStable();
    expect(state.detalle.error()).toBeInstanceOf(ErrorCanalWhatsapp);
    expect(state.detalleActual()).toBeNull();
    expect(state.mensajesConFecha()).toEqual([]);
    expect(state.plantillasWhatsApp.value()).toEqual([]);
    expect(state.errorDetalle()).toContain('identificar la línea');
  });

  it('descarta resúmenes realtime sin canal conservando la fila válida', async () => {
    const refresco = state.refrescarFilaPorRealtime(CHAT.id);
    responder('/conversaciones/chat-1/resumen', {
      conversacion: { ...CHAT, linea: undefined }, contadores: PAGINA.contadores,
    });
    await refresco;
    expect(state.conversacionesFiltradas()).toEqual([CHAT]);
  });

  it('no incorpora una página siguiente sin canal', async () => {
    state.inbox.set({ ...PAGINA, total: 2, totalPaginas: 2 });
    const carga = state.cargarMas();
    responder('/conversaciones', { ...PAGINA, pagina: 2, datos: [{ ...CHAT, id: 'chat-2', linea: undefined }] });
    await carga;
    expect(state.conversacionesFiltradas()).toEqual([CHAT]);
    expect(state.cargandoMas()).toBe(false);
    expect(state.hayMasConversaciones()).toBe(true);
  });

});
