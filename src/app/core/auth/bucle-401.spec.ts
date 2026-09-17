import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { API_URL } from '../api/api.constants';
import { AuthService } from '../auth/auth.service';
import { tokenInterceptor } from '../auth/token.interceptor';
import { PwaUpdateService } from '../pwa/pwa-update.service';

/**
 * El bucle 401 → logout → recarga → 401 que dejó el inbox fuera 46 segundos
 * el 2026-09-17, tras un reinicio del backend.
 *
 * La cascada se sostenía sola: cada `logout()` incrementa `generacionSesion`,
 * eso despertaba al effect de Conversaciones, que volvía a pedir datos
 * protegidos, que sin token daban 401, que llamaban a `logout()` otra vez.
 * 120 vueltas a 2,6 por segundo, 478 peticiones, hasta que el rate-limit
 * empezó a devolver 429 —también al propio logout—.
 *
 * Lo que estas pruebas fijan es el corte: quien ya está deslogueado no se
 * vuelve a desloguear, y sin sesión no se piden recursos protegidos. Y lo que
 * NO pueden romper es la razón por la que el effect existe: en la clínica
 * varias agentes comparten equipo y el estado de una no puede sobrevivir a la
 * siguiente.
 */

const TOKEN_KEY = 'crm_token';
const USUARIO_KEY = 'crm_usuario';

function sembrarSesion(nombre = 'Agente A'): void {
  localStorage.setItem(TOKEN_KEY, `token-de-${nombre}`);
  localStorage.setItem(USUARIO_KEY, JSON.stringify({
    id: nombre, nombre, email: `${nombre}@test.local`, rol: 'AGENTE',
  }));
}

describe('bucle 401 · el interceptor no desloguea a quien ya salió', () => {
  let http: HttpClient;
  let ctrl: HttpTestingController;
  let auth: AuthService;

  function montar(): void {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([tokenInterceptor])),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: PwaUpdateService, useValue: { aplicarActualizacion: () => Promise.resolve() } },
      ],
    });
    http = TestBed.inject(HttpClient);
    ctrl = TestBed.inject(HttpTestingController);
    auth = TestBed.inject(AuthService);
  }

  const cuantos = (fragmento: string): number =>
    ctrl.match(r => r.url.includes(fragmento)).length;

  beforeEach(() => { localStorage.clear(); sessionStorage.clear(); });
  afterEach(() => {
    ctrl.match(() => true).filter(p => !p.cancelled)
      .forEach(p => p.flush({}, { status: 200, statusText: 'OK' }));
    localStorage.clear(); sessionStorage.clear();
  });

  it('A · diez 401 concurrentes SIN token: cero refresh, cero logout, cero cambios de generación', async () => {
    montar();
    expect(auth.token).toBeFalsy();
    const generacionInicial = auth.generacionSesion();

    for (let i = 0; i < 10; i++) {
      http.get(`${API_URL}/conversaciones?n=${i}`).subscribe({ next: () => {}, error: () => {} });
    }
    const protegidas = ctrl.match(r => r.url.includes('/conversaciones'));
    expect(protegidas).toHaveLength(10);
    protegidas.forEach(p => p.flush({}, { status: 401, statusText: 'Unauthorized' }));
    await new Promise(r => setTimeout(r, 30));

    /* Lo que antes producía: 0 refresh (no hay token que refrescar) pero SÍ un
       logout, que era el primer eslabón de la cascada. */
    expect(cuantos('/auth/refresh')).toBe(0);
    expect(cuantos('/auth/logout')).toBe(0);
    expect(auth.generacionSesion()).toBe(generacionInicial);
  });

  it('B · CON token y refresh rechazado: intenta refrescar, desloguea UNA vez', async () => {
    sembrarSesion();
    montar();
    expect(auth.token).toBeTruthy();
    const generacionInicial = auth.generacionSesion();

    for (let i = 0; i < 5; i++) {
      http.get(`${API_URL}/conversaciones?n=${i}`).subscribe({ next: () => {}, error: () => {} });
    }
    ctrl.match(r => r.url.includes('/conversaciones'))
      .forEach(p => p.flush({}, { status: 401, statusText: 'Unauthorized' }));
    await new Promise(r => setTimeout(r, 20));

    /* Deduplicado: cinco 401 simultáneos comparten un solo refresco. */
    const refrescos = ctrl.match(r => r.url.includes('/auth/refresh'));
    expect(refrescos).toHaveLength(1);
    refrescos[0].flush({}, { status: 401, statusText: 'Unauthorized' });
    await new Promise(r => setTimeout(r, 30));

    /* Este camino NO cambia: la sesión era real y el servidor la rechazó. */
    expect(cuantos('/auth/logout')).toBe(1);
    expect(auth.generacionSesion()).toBeGreaterThan(generacionInicial);
    expect(auth.token).toBeFalsy();
  });

  it('C · tras ese logout, los 401 que siguen llegando ya no deslogean otra vez', async () => {
    sembrarSesion();
    montar();

    http.get(`${API_URL}/conversaciones`).subscribe({ next: () => {}, error: () => {} });
    ctrl.expectOne(r => r.url.includes('/conversaciones')).flush({}, { status: 401, statusText: 'Unauthorized' });
    await new Promise(r => setTimeout(r, 20));
    ctrl.match(r => r.url.includes('/auth/refresh'))
      .forEach(r => r.flush({}, { status: 401, statusText: 'Unauthorized' }));
    await new Promise(r => setTimeout(r, 30));

    const logoutsTrasElPrimero = cuantos('/auth/logout');
    expect(logoutsTrasElPrimero).toBe(1);
    ctrl.match(r => r.url.includes('/auth/logout')).forEach(l => l.flush({}, { status: 204, statusText: 'No Content' }));
    const generacionTrasLogout = auth.generacionSesion();

    /* La cola de peticiones que el inbox ya tenía en vuelo sigue llegando. */
    for (let i = 0; i < 8; i++) {
      http.get(`${API_URL}/lineas-whatsapp?n=${i}`).subscribe({ next: () => {}, error: () => {} });
    }
    ctrl.match(r => r.url.includes('/lineas-whatsapp'))
      .forEach(p => p.flush({}, { status: 401, statusText: 'Unauthorized' }));
    await new Promise(r => setTimeout(r, 30));

    /* Aquí estaba el bucle: ocho 401 más habrían sido ocho logouts más. */
    expect(cuantos('/auth/logout')).toBe(0);
    expect(cuantos('/auth/refresh')).toBe(0);
    expect(auth.generacionSesion()).toBe(generacionTrasLogout);
  });
});
