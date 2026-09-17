import '@angular/compiler';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { SwPush } from '@angular/service-worker';
import { BehaviorSubject } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PwaUpdateService } from '../pwa/pwa-update.service';
import { AuthService } from './auth.service';
import { tokenInterceptor } from './token.interceptor';

/**
 * F09 · al cerrar sesión, el dispositivo deja de recibir push.
 *
 * En la clínica varias agentes comparten la misma tablet. Antes, la suscripción
 * sobrevivía al logout: la siguiente notificación seguía mostrando en la
 * pantalla de bloqueo el nombre de la paciente y los primeros 80 caracteres de
 * su mensaje, a nombre de quien ya había salido.
 *
 * Lo que fija esta suite es el ORDEN. La baja es una petición autenticada, así
 * que tiene que salir mientras el token existe: comprobarlo mirando la cabecera
 * `Authorization` de esa petición es más fuerte que comprobar que se llamó.
 */

const usuario = { id: 'A', nombre: 'Ana', email: 'a@f09.test', rol: 'AGENTE', iniciales: 'A', foto: null };
const ENDPOINT = 'https://fcm.googleapis.com/fcm/send/TABLET-COMPARTIDA';

let auth: AuthService;
let pruebas: HttpTestingController;
/** Lo mínimo de `PushSubscription` que toca el código: su endpoint y su baja. */
interface SuscripcionFalsa {
  endpoint: string;
  unsubscribe: () => Promise<boolean>;
}

let suscripcion: BehaviorSubject<SuscripcionFalsa | null>;
let cancelar: ReturnType<typeof vi.fn<() => Promise<boolean>>>;

function montar(opciones: { conSuscripcion: boolean }): void {
  cancelar = vi.fn<() => Promise<boolean>>().mockResolvedValue(true);
  suscripcion = new BehaviorSubject<SuscripcionFalsa | null>(
    opciones.conSuscripcion ? { endpoint: ENDPOINT, unsubscribe: cancelar } : null,
  );

  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem('crm_token', 'token-anterior');
  localStorage.setItem('crm_usuario', JSON.stringify(usuario));

  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(withInterceptors([tokenInterceptor])),
      provideHttpClientTesting(),
      { provide: Router, useValue: { navigate: vi.fn() } },
      { provide: PwaUpdateService, useValue: { aplicarActualizacion: vi.fn() } },
      { provide: SwPush, useValue: { isEnabled: true, subscription: suscripcion.asObservable() } },
    ],
  });
  auth = TestBed.inject(AuthService);
  pruebas = TestBed.inject(HttpTestingController);
}

/** La baja del push, si salió. */
function bajaDePush() {
  return pruebas.match(r => r.method === 'DELETE' && r.url.endsWith('/push/desuscribir'));
}

afterEach(() => {
  for (const r of pruebas.match(r => r.url.endsWith('/auth/logout'))) {
    r.flush(null, { status: 204, statusText: 'No Content' });
  }
  localStorage.clear();
  sessionStorage.clear();
  TestBed.resetTestingModule();
});

describe('F09 · logout da de baja el push de este dispositivo', () => {
  it('Caso D · la baja sale autenticada, antes de perder la credencial', () => {
    montar({ conSuscripcion: true });

    auth.logout();

    const baja = bajaDePush();
    expect(baja).toHaveLength(1);
    expect(baja[0].request.params.get('endpoint')).toBe(ENDPOINT);
    /* La prueba de que salió ANTES: el interceptor solo pudo poner esta cabecera
       si el token seguía en su sitio cuando la petición se despachó. */
    expect(baja[0].request.headers.get('Authorization')).toBe('Bearer token-anterior');
    // Y para cuando `logout()` devuelve, la credencial ya no está.
    expect(auth.token).toBeNull();
    expect(auth.user()).toBeNull();

    baja[0].flush({ ok: true });
  });

  it('Caso E · si la baja en el servidor falla, la sesión se cierra igual', () => {
    montar({ conSuscripcion: true });

    auth.logout();
    bajaDePush()[0].flush('nope', { status: 500, statusText: 'Server Error' });

    expect(auth.token).toBeNull();
    expect(auth.user()).toBeNull();
  });

  it('Caso F · si falla cancelar en el navegador, la sesión se cierra igual', async () => {
    montar({ conSuscripcion: true });
    cancelar.mockRejectedValue(new Error('el navegador la descartó'));

    auth.logout();
    bajaDePush()[0].flush({ ok: true });
    await Promise.resolve();
    await Promise.resolve();

    expect(cancelar).toHaveBeenCalled();
    expect(auth.token).toBeNull();
    expect(auth.user()).toBeNull();
  });

  it('Caso G · sin suscripción no se pide nada y la sesión se cierra igual', () => {
    montar({ conSuscripcion: false });

    auth.logout();

    /* Ni una petición de más: pedir la baja de un endpoint que no existe sería
       ruido en el journal del servidor y un 400 por un DTO sin `endpoint`. */
    expect(bajaDePush()).toHaveLength(0);
    expect(auth.token).toBeNull();
    expect(auth.user()).toBeNull();
  });

  it('cancela también la suscripción en el navegador', async () => {
    montar({ conSuscripcion: true });

    auth.logout();
    bajaDePush()[0].flush({ ok: true });
    await Promise.resolve();
    await Promise.resolve();

    expect(cancelar).toHaveBeenCalledTimes(1);
  });
});
