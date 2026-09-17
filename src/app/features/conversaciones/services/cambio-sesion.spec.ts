import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthService } from '../../../core/auth/auth.service';
import { ConversacionesStateService } from './conversaciones-state.service';

/**
 * El otro extremo del bucle del 2026-09-17.
 *
 * El effect que limpia el estado al cambiar de sesión existe por una razón
 * concreta: en la clínica varias agentes comparten equipo y lo que cargó una
 * no puede quedarse para la siguiente. Pero miraba `generacionSesion`, que es
 * justo lo que `logout()` incrementa, así que SALIR disparaba una recarga de
 * datos protegidos —sin token— y cada 401 llamaba a `logout()` otra vez.
 *
 * Estas pruebas fijan las dos mitades: al salir se limpia y NO se recarga; al
 * entrar otra agente se limpia Y se recarga, que es lo que no se podía perder.
 */
describe('cambio de sesión · limpiar siempre, recargar solo con sesión', () => {
  let state: ConversacionesStateService;
  let http: HttpTestingController;
  let usuario: ReturnType<typeof signal<{ id: string; nombre: string } | null>>;
  let generacion: ReturnType<typeof signal<number>>;

  const pedidas = (fragmento: string): number =>
    http.match(r => r.url.includes(fragmento)).length;

  function montar(inicial: { id: string; nombre: string } | null): void {
    TestBed.resetTestingModule();
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    usuario = signal(inicial);
    generacion = signal(1);
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(), provideHttpClientTesting(), provideRouter([]),
        { provide: AuthService, useValue: {
          isAdmin: signal(false), generacionSesion: generacion.asReadonly(),
          puedeGestionComercial: signal(true), user: usuario.asReadonly(),
        } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    state = TestBed.inject(ConversacionesStateService);
    TestBed.tick();
  }

  beforeEach(() => { vi.stubGlobal('matchMedia', () => ({ matches: false })); });
  afterEach(() => {
    http.match(() => true).filter(p => !p.cancelled)
      .forEach(p => p.flush({}, { status: 200, statusText: 'OK' }));
    TestBed.resetTestingModule();
    vi.unstubAllGlobals();
  });

  it('C · al SALIR se limpia el estado pero no se piden datos protegidos', () => {
    montar({ id: 'a', nombre: 'Agente A' });
    state.seleccionadaId.set('chat-1');
    state.mensajeNuevo.set('borrador a medias');
    TestBed.tick();
    http.match(() => true).forEach(p => p.flush({}, { status: 200, statusText: 'OK' }));

    /* logout(): el usuario se va y la generación sube. */
    usuario.set(null);
    generacion.update(n => n + 1);
    TestBed.tick();

    /* La limpieza —la razón del effect— sigue ocurriendo. */
    expect(state.seleccionadaId()).toBeNull();
    expect(state.mensajeNuevo()).toBe('');

    /* Y esto es lo que alimentaba el bucle: ni una petición protegida. */
    expect(pedidas('/lineas-whatsapp')).toBe(0);
    expect(pedidas('/conversaciones')).toBe(0);
  });

  it('D · al entrar OTRA agente se limpia Y se recarga: la razón original se conserva', () => {
    montar({ id: 'a', nombre: 'Agente A' });
    state.seleccionadaId.set('chat-de-A');
    TestBed.tick();
    http.match(() => true).forEach(p => p.flush({}, { status: 200, statusText: 'OK' }));

    /* Sale A y entra B en el mismo equipo. */
    usuario.set({ id: 'b', nombre: 'Agente B' });
    generacion.update(n => n + 1);
    TestBed.tick();
    TestBed.tick();

    expect(state.seleccionadaId()).toBeNull();

    /* B tiene que ver SUS datos, no los de A: el inbox vuelve a pedirse en
       cuanto hay sesión. Es exactamente lo que el caso C prohíbe cuando no la
       hay, y la razón por la que el arreglo mira `user()` y no la generación
       a secas. */
    expect(pedidas('/conversaciones')).toBeGreaterThan(0);
  });

  it('sin sesión, el recurso del inbox no se pide aunque cambien los filtros', () => {
    montar(null);
    http.match(() => true).forEach(p => p.flush({}, { status: 200, statusText: 'OK' }));

    state.busqueda.set('ana');
    TestBed.tick();
    state.filtroLineaId.set('linea-9');
    TestBed.tick();

    expect(pedidas('/conversaciones')).toBe(0);
  });
});
