import '@angular/compiler';
import { HttpClient, HttpErrorResponse, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from './auth.service';
import { tokenInterceptor } from './token.interceptor';
import { PwaUpdateService } from '../pwa/pwa-update.service';

const usuario = { id: 'A', nombre: 'Ana', email: 'a@f05.test', rol: 'AGENTE', iniciales: 'A', foto: null };
const respuesta = (id = 'A') => ({ access_token: 'token-' + id, usuario: { ...usuario, sub: id } });
let auth: AuthService;
let http: HttpClient;
let pruebas: HttpTestingController;
const router = { navigate: vi.fn() };
beforeEach(() => {
  localStorage.clear(); sessionStorage.clear(); router.navigate.mockClear();
  localStorage.setItem('crm_token', 'token-anterior');
  localStorage.setItem('crm_usuario', JSON.stringify(usuario));
  TestBed.configureTestingModule({ providers: [
    provideHttpClient(withInterceptors([tokenInterceptor])), provideHttpClientTesting(),
    { provide: Router, useValue: router }, { provide: PwaUpdateService, useValue: { aplicarActualizacion: vi.fn() } },
  ] });
  auth = TestBed.inject(AuthService); http = TestBed.inject(HttpClient); pruebas = TestBed.inject(HttpTestingController);
});
afterEach(() => {
  for (const r of pruebas.match(r => r.url.endsWith('/auth/logout'))) r.flush(null, { status: 204, statusText: 'No Content' });
  pruebas.verify(); localStorage.clear(); sessionStorage.clear();
});

describe('F05 · AuthService e interceptor reales', () => {
  it.each([0, 500, 503])('refresh con fallo %s conserva la sesión y propaga el error transitorio', async status => {
    const pendiente = firstValueFrom(http.get('/clientes')).catch((e: HttpErrorResponse) => e);
    pruebas.expectOne('/clientes').flush({}, { status: 401, statusText: 'Unauthorized' });
    const refresh = pruebas.expectOne(r => r.url.endsWith('/auth/refresh'));
    if (status === 0) refresh.error(new ProgressEvent('error'));
    else refresh.flush({}, { status, statusText: 'Servicio no disponible' });
    const error = await pendiente as HttpErrorResponse;
    expect(error.status).toBe(status);
    expect(auth.user()?.id).toBe('A'); expect(auth.token).toBe('token-anterior');
    expect(router.navigate).not.toHaveBeenCalled();
    pruebas.expectNone(r => r.url.endsWith('/auth/logout'));
  });
  it('un refresh 401 sí cierra la sesión y no entra en bucle', async () => {
    const pendiente = firstValueFrom(http.get('/clientes')).catch((e: HttpErrorResponse) => e);
    pruebas.expectOne('/clientes').flush({}, { status: 401, statusText: 'Unauthorized' });
    pruebas.expectOne(r => r.url.endsWith('/auth/refresh')).flush({}, { status: 401, statusText: 'Unauthorized' });
    await pendiente;
    expect(auth.user()).toBeNull(); expect(auth.token).toBeNull();
    expect(router.navigate).toHaveBeenCalledWith(['/auth/login']);
  });
  it('un refresh que termina después de logout no restaura la sesión', async () => {
    const pendiente = auth.refrescarToken().catch(() => null);
    const refresh = pruebas.expectOne(r => r.url.endsWith('/auth/refresh'));
    auth.logout(); refresh.flush(respuesta()); await pendiente;
    expect(auth.user()).toBeNull(); expect(auth.token).toBeNull();
  });
  it('la respuesta de refresco de A no sobrescribe el login posterior de B', async () => {
    const pendiente = auth.refrescarToken().catch(() => null);
    const refresh = pruebas.expectOne(r => r.url.endsWith('/auth/refresh'));
    const login = auth.login('b@f05.test', 'ficticia');
    pruebas.expectOne(r => r.url.endsWith('/auth/login')).flush(respuesta('B'));
    expect(await login).toBe(true);
    refresh.flush(respuesta('A')); await pendiente;
    expect(auth.user()?.id).toBe('B'); expect(auth.token).toBe('token-B');
  });
  it('el login permite establecer la cookie de sesión entre orígenes', async () => {
    const pendiente = auth.login('a@f05.test', 'ficticia');
    const login = pruebas.expectOne(r => r.url.endsWith('/auth/login'));
    const credenciales = login.request.withCredentials;
    login.flush(respuesta()); await pendiente;
    expect(credenciales).toBe(true);
  });
  it('varios refresh simultáneos comparten una petición y conservan el storage elegido', async () => {
    sessionStorage.setItem('crm_token', localStorage.getItem('crm_token')!); localStorage.removeItem('crm_token');
    const a = auth.refrescarToken(); const b = auth.refrescarToken();
    expect(a).toBe(b);
    pruebas.expectOne(r => r.url.endsWith('/auth/refresh')).flush(respuesta());
    expect(await a).toBe('token-A'); expect(await b).toBe('token-A');
    expect(sessionStorage.getItem('crm_token')).toBe('token-A'); expect(localStorage.getItem('crm_token')).toBeNull();
  });
  it('un 401 tardío de A no intenta refrescar ni desloguear a B', async () => {
    const anterior = firstValueFrom(http.get('/clientes')).catch((e: HttpErrorResponse) => e);
    const peticion = pruebas.expectOne('/clientes');
    const login = auth.login('b@f05.test', 'ficticia');
    pruebas.expectOne(r => r.url.endsWith('/auth/login')).flush(respuesta('B')); await login;
    peticion.flush({}, { status: 401, statusText: 'Unauthorized' }); await anterior;
    pruebas.expectNone(r => r.url.endsWith('/auth/refresh') || r.url.endsWith('/auth/logout'));
    expect(auth.user()?.id).toBe('B');
  });
});
