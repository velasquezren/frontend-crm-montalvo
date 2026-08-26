import '@angular/compiler';
import {
  HttpErrorResponse,
  HttpEvent,
  HttpHandlerFn,
  HttpRequest,
  HttpResponse,
} from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { firstValueFrom, Observable, of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

import { AuthService } from './auth.service';
import { PwaUpdateService } from '../pwa/pwa-update.service';
import { tokenInterceptor } from './token.interceptor';

/**
 * `tokenInterceptor` es lo único que decide si una sesión con el
 * `access_token` vencido revive sola o manda al login. Lo que más importa
 * fijar acá es el freno anti-bucle: si el token NUEVO (recién refrescado)
 * también recibe un 401, el problema no es el token, es la sesión, y no hay
 * que reintentar para siempre — antes de esto la agente se quedaba en una
 * pantalla que fallaba en bucle sin ninguna pista.
 *
 * Dobles de `AuthService`/`Router`/`PwaUpdateService`; el `next` de la cadena
 * es una función a medida que simula lo que respondería el backend.
 */

function montar(
  opciones: {
    token?: string | null;
    refrescarToken?: () => Promise<string | null>;
  } = {},
) {
  const authService = {
    // `??` trataría `null` como "sin valor" y volvería al default: acá `null`
    // es un caso real (sin sesión), así que solo `undefined` cae al default.
    token: opciones.token !== undefined ? opciones.token : 'access-token-viejo',
    refrescarToken: opciones.refrescarToken ?? (async () => 'access-token-nuevo'),
    logout: vi.fn(),
  };
  const router = { navigate: vi.fn() };
  const pwaUpdateService = { aplicarActualizacion: vi.fn() };

  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: AuthService, useValue: authService },
      { provide: Router, useValue: router },
      { provide: PwaUpdateService, useValue: pwaUpdateService },
    ],
  });

  return { authService, router, pwaUpdateService };
}

/** Simula la cadena de handlers: la primera llamada responde con `primero`,
 *  las siguientes con `resto` (por defecto, éxito). Registra cada petición
 *  que le llega para poder inspeccionar sus cabeceras. */
function crearNext(primero: 'exito' | '401', resto: 'exito' | '401' = 'exito'): {
  next: HttpHandlerFn;
  peticiones: HttpRequest<unknown>[];
  totalLlamadas: () => number;
} {
  const peticiones: HttpRequest<unknown>[] = [];
  let llamadas = 0;

  const next: HttpHandlerFn = (req): Observable<HttpEvent<unknown>> => {
    peticiones.push(req);
    llamadas++;
    const resultado = llamadas === 1 ? primero : resto;
    if (resultado === '401') {
      return throwError(() => new HttpErrorResponse({ status: 401, url: req.url }));
    }
    return of(new HttpResponse({ status: 200 }));
  };

  return { next, peticiones, totalLlamadas: () => llamadas };
}

function ejecutar(req: HttpRequest<unknown>, next: HttpHandlerFn) {
  return TestBed.runInInjectionContext(() => tokenInterceptor(req, next));
}

describe('tokenInterceptor · adjuntar el token', () => {
  it('agrega el header Authorization cuando hay token', async () => {
    montar({ token: 'mi-token' });
    const { next, peticiones } = crearNext('exito');

    await firstValueFrom(ejecutar(new HttpRequest('GET', '/clientes'), next));

    expect(peticiones[0].headers.get('Authorization')).toBe('Bearer mi-token');
  });

  it('sin token, no agrega el header (deja pasar la petición tal cual)', async () => {
    montar({ token: null });
    const { next, peticiones } = crearNext('exito');

    await firstValueFrom(ejecutar(new HttpRequest('GET', '/clientes'), next));

    expect(peticiones[0].headers.has('Authorization')).toBe(false);
  });
});

describe('tokenInterceptor · 401 en login/refresh/logout: nunca refresca', () => {
  it.each(['/auth/login', '/auth/refresh', '/auth/logout'])(
    'un 401 en %s sube tal cual, sin intentar refrescar ni desloguear',
    async ruta => {
      const { authService } = montar();
      const refrescar = vi.fn(authService.refrescarToken);
      montar({ refrescarToken: refrescar });
      const { next, totalLlamadas } = crearNext('401');

      await expect(firstValueFrom(ejecutar(new HttpRequest('GET', ruta), next))).rejects.toBeInstanceOf(
        HttpErrorResponse,
      );

      expect(refrescar).not.toHaveBeenCalled();
      expect(totalLlamadas()).toBe(1); // no hubo reintento
    },
  );
});

describe('tokenInterceptor · refresco silencioso ante un 401 ajeno', () => {
  it('éxito: refresca, reintenta la petición original con el token nuevo, y no desloguea', async () => {
    const { authService, router } = montar();
    const { next, peticiones, totalLlamadas } = crearNext('401', 'exito');

    await firstValueFrom(ejecutar(new HttpRequest('GET', '/clientes'), next));

    expect(totalLlamadas()).toBe(2); // original + reintento
    expect(peticiones[1].headers.get('Authorization')).toBe('Bearer access-token-nuevo');
    expect(authService.logout).not.toHaveBeenCalled();
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('si el refresco falla (no hay refresh_token válido), desloguea y no reintenta', async () => {
    const { authService, router } = montar({ refrescarToken: async () => null });
    const { next, totalLlamadas } = crearNext('401');

    await expect(
      firstValueFrom(ejecutar(new HttpRequest('GET', '/clientes'), next)),
    ).rejects.toBeInstanceOf(HttpErrorResponse);

    expect(totalLlamadas()).toBe(1); // nunca reintentó: no había con qué
    expect(authService.logout).toHaveBeenCalledTimes(1);
    expect(router.navigate).toHaveBeenCalledWith(['/auth/login']);
  });

  /* El freno anti-bucle: sin esto, un token nuevo que TAMBIÉN da 401 (usuario
     desactivado, permisos revocados) dejaba a la agente reintentando para
     siempre sin ninguna pista de qué pasaba. */
  it('si el reintento con el token NUEVO también da 401, desloguea (no reintenta de nuevo)', async () => {
    const { authService, router } = montar();
    const { next, totalLlamadas } = crearNext('401', '401');

    await expect(
      firstValueFrom(ejecutar(new HttpRequest('GET', '/clientes'), next)),
    ).rejects.toBeInstanceOf(HttpErrorResponse);

    expect(totalLlamadas()).toBe(2); // original + UN reintento, no más
    expect(authService.logout).toHaveBeenCalledTimes(1);
    expect(router.navigate).toHaveBeenCalledWith(['/auth/login']);
  });

  /* Ante varios 401 casi simultáneos (típico al volver de segundo plano con
     el access_token ya vencido), todas las peticiones deben compartir el
     MISMO refresco en vuelo — lo prueba refrescarToken() de AuthService, acá
     solo se confirma que el interceptor efectivamente lo llama y usa lo que
     devuelve, sin asumir una implementación concreta de la deduplicación. */
  it('usa el token que devuelve refrescarToken(), sea cual sea', async () => {
    montar({ refrescarToken: async () => 'otro-token-cualquiera' });
    const { next, peticiones } = crearNext('401', 'exito');

    await firstValueFrom(ejecutar(new HttpRequest('GET', '/clientes'), next));

    expect(peticiones[1].headers.get('Authorization')).toBe('Bearer otro-token-cualquiera');
  });
});

describe('tokenInterceptor · sin 401, no toca nada de sesión', () => {
  it('una respuesta exitosa pasa derecho, sin llamar a refrescarToken', async () => {
    const { authService } = montar();
    const refrescar = vi.fn(authService.refrescarToken);
    montar({ refrescarToken: refrescar });
    const { next } = crearNext('exito');

    const respuesta = await firstValueFrom(ejecutar(new HttpRequest('GET', '/clientes'), next));

    expect((respuesta as HttpResponse<unknown>).status).toBe(200);
    expect(refrescar).not.toHaveBeenCalled();
  });
});
