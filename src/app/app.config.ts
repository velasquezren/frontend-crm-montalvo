import { registerLocaleData } from '@angular/common';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import localeEsBo from '@angular/common/locales/es-BO';
import { ApplicationConfig, inject, LOCALE_ID, provideAppInitializer, provideZonelessChangeDetection, provideBrowserGlobalErrorListeners, isDevMode } from '@angular/core';
import { provideRouter, withComponentInputBinding, withViewTransitions, withPreloading } from '@angular/router';

import { routes } from './app.routes';
import { cacheInterceptor } from './core/api/cache.interceptor';
import { AuthService } from './core/auth/auth.service';
import { PreloadPorRol } from './core/auth/preload-por-rol.strategy';
import { tokenInterceptor } from './core/auth/token.interceptor';
import { provideServiceWorker } from '@angular/service-worker';

/*
 * El idioma de los datos, no solo de los textos.
 *
 * Sin `LOCALE_ID`, Angular usa `en-US`: los quince formatos con mes de texto
 * del CRM —«d MMM y», «d MMM, HH:mm»— salían en INGLÉS («9 Oct 2026»,
 * «14 Aug 2026») en una clínica boliviana. Y convivían con los helpers de TS
 * que sí lo hacían en español (`fechaCorta`, `fechaDeReserva`): el mismo mes
 * escrito de dos maneras según la pantalla. El dinero ya iba en `es-BO`
 * explícito (`Intl.NumberFormat` del servicio de moneda), así que las fechas
 * eran lo único que seguía en inglés.
 *
 * `registerLocaleData` es obligatorio: sin los datos del locale, `LOCALE_ID`
 * a secas no basta y `DatePipe` lanza.
 */
registerLocaleData(localeEsBo);

export const appConfig: ApplicationConfig = {
  providers: [
    { provide: LOCALE_ID, useValue: 'es-BO' },
    provideZonelessChangeDetection(),
    provideBrowserGlobalErrorListeners(),
    provideRouter(
      routes,
      withViewTransitions(),
      withComponentInputBinding(),
      /* Precarga solo lo que el rol puede abrir. `PreloadAllModules` bajaba
         388,4 kB gzip de rutas en segundo plano, de los cuales 109,6 kB son
         pantallas de ADMIN que una agente nunca puede abrir. El porqué y la
         medición, en `preload-por-rol.strategy.ts`. */
      withPreloading(PreloadPorRol),
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
