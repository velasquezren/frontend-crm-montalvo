import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { ApplicationConfig, inject, provideAppInitializer, provideZonelessChangeDetection, provideBrowserGlobalErrorListeners, isDevMode } from '@angular/core';
import { provideRouter, withComponentInputBinding, withViewTransitions, withPreloading, PreloadAllModules } from '@angular/router';

import { routes } from './app.routes';
import { cacheInterceptor } from './core/api/cache.interceptor';
import { AuthService } from './core/auth/auth.service';
import { tokenInterceptor } from './core/auth/token.interceptor';
import { provideServiceWorker } from '@angular/service-worker';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZonelessChangeDetection(),
    provideBrowserGlobalErrorListeners(),
    provideRouter(
      routes,
      withViewTransitions(),
      withComponentInputBinding(),
      withPreloading(PreloadAllModules),
    ),
    /* Orden a propósito: la caché va PRIMERO para que una respuesta servida de
       memoria ni siquiera pase por el interceptor del token. */
    provideHttpClient(withInterceptors([cacheInterceptor, tokenInterceptor])),
    /* El rol viaja dentro del JWT y se cachea en el navegador: si a alguien le
       cambian el rol, su sesión sigue con el anterior hasta 8h. Al arrancar se
       contrasta con el servidor y, si cambió, se cierra la sesión para que
       vuelva a entrar con un token coherente (ver AuthService.sincronizarRol).

       **Se dispara sin `return` a propósito.** `provideAppInitializer` espera lo
       que se le devuelva antes de arrancar Angular: devolver la promesa dejaba
       la pantalla en blanco durante todo el round-trip a `/auth/perfil` —medido
       contra producción: ~575 ms en frío, de los cuales 385 son solo el
       handshake TLS— en CADA carga y en cada F5.

       Ahora la app pinta de inmediato y la comprobación termina medio segundo
       después; si el rol cambió, cierra la sesión igual. La única ventana es ese
       medio segundo en el que alguien degradado vería un menú de más, y pulsarlo
       no le sirve: el backend es la autoridad y responde 403 (ver la regla de
       visibilidad por rol en el skill crm-feature-page). */
    provideAppInitializer(() => {
      void inject(AuthService).sincronizarRol();
    }),
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
  ],
};
