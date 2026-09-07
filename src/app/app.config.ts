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
    /* El usuario se restaura localmente para pintar sin esperar al servidor.
       La consulta de perfil actualiza esa presentación. El backend valida la
       sesión en cada petición; un cambio de rol revoca sus credenciales y
       devuelve 401 (ver AuthService.sincronizarRol y tokenInterceptor).

       **Se dispara sin `return` a propósito.** `provideAppInitializer` espera lo
       que se le devuelva antes de arrancar Angular: devolver la promesa dejaba
       la pantalla en blanco durante todo el round-trip a `/auth/perfil` —medido
       contra producción: ~575 ms en frío, de los cuales 385 son solo el
       handshake TLS— en CADA carga y en cada F5.

       La app pinta de inmediato. El menú local puede quedar temporalmente
       desactualizado, pero la autorización del servidor no depende de esa
       comprobación de presentación. */
    provideAppInitializer(() => {
      void inject(AuthService).sincronizarRol();
    }),
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerImmediately',
    }),
  ],
};
