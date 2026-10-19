import { HttpClient, HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { mensajeDeError } from './http-error';
import { envioSeReintentaSinRiesgo } from '../../features/conversaciones/clasificar-error-envio';

/**
 * Contrato del transporte HTTP real (fetch, el predeterminado de Angular 22).
 *
 * El resto de las pruebas usa HttpTestingController, que reemplaza el backend:
 * por eso ninguna notaba que con fetch el error sin red trae otro `error.error`.
 * Aquí solo se sustituye `globalThis.fetch`, y Angular hace el resto. Si una
 * versión futura cambia algo de esto, falla aquí y no en producción.
 */
describe('transporte HTTP (fetch)', () => {
  let http: HttpClient;
  let fetchFalso: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    TestBed.resetTestingModule();
    fetchFalso = vi.fn();
    vi.stubGlobal('fetch', fetchFalso);
    TestBed.configureTestingModule({ providers: [provideHttpClient()] });
    http = TestBed.inject(HttpClient);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    TestBed.resetTestingModule();
  });

  it('sin red: status 0, ambiguo para reenviar y mensaje en español', async () => {
    fetchFalso.mockRejectedValue(new TypeError('Failed to fetch'));

    const error = await firstValueFrom(http.get('/api/v1/algo')).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(HttpErrorResponse);
    expect((error as HttpErrorResponse).status).toBe(0);
    expect(envioSeReintentaSinRiesgo(error)).toBe(false);
    expect(mensajeDeError(error, 'respaldo')).toBe('No se pudo contactar al servidor. Verifica tu conexión.');
  });

  it('withCredentials manda las cookies (refresh y logout dependen de ello)', async () => {
    fetchFalso.mockResolvedValue(new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }));

    await firstValueFrom(http.post('/api/v1/auth/refresh', {}, { withCredentials: true }));

    expect(fetchFalso.mock.calls[0][1].credentials).toBe('include');
  });

  it('una respuesta vacía es null, como con XHR', async () => {
    fetchFalso.mockResolvedValue(new Response(null, { status: 204 }));

    await expect(firstValueFrom(http.delete('/api/v1/algo/1'))).resolves.toBeNull();
  });

  it('un error del servidor conserva su cuerpo y su código', async () => {
    fetchFalso.mockResolvedValue(new Response(JSON.stringify({ message: 'Ventana de 24 h vencida' }), {
      status: 403, headers: { 'Content-Type': 'application/json' },
    }));

    const error = await firstValueFrom(http.post('/api/v1/conversaciones/x/mensajes', {})).catch((e: unknown) => e);

    expect((error as HttpErrorResponse).status).toBe(403);
    expect(envioSeReintentaSinRiesgo(error)).toBe(true);
    expect(mensajeDeError(error, 'respaldo')).toBe('Ventana de 24 h vencida');
  });
});
