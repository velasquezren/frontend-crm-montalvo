import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { ApplicationConfig, inject, provideAppInitializer, provideZonelessChangeDetection, provideBrowserGlobalErrorListeners, isDevMode } from '@angular/core';
import { provideRouter, withComponentInputBinding, withViewTransitions, withPreloading, PreloadAllModules } from '@angular/router';

import { routes } from './app.routes';
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
    provideHttpClient(withInterceptors([tokenInterceptor])),
    /* El rol viaja dentro del JWT y se cachea en el navegador: si a alguien le
       cambian el rol, su sesión sigue con el anterior hasta 8h. Al arrancar se
       contrasta con el servidor y, si cambió, se cierra la sesión para que
       vuelva a entrar con un token coherente (ver AuthService.sincronizarRol). */
    provideAppInitializer(() => inject(AuthService).sincronizarRol()),
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
  ],
};
