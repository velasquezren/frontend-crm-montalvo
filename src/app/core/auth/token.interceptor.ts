import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { from, switchMap, tap, catchError, throwError } from 'rxjs';

import { AuthService } from './auth.service';
import { PwaUpdateService } from '../pwa/pwa-update.service';

function esPeticionDeAutenticacion(url: string): boolean {
  return url.endsWith('/auth/login') || url.endsWith('/auth/refresh');
}

/**
 * Adjunta el JWT a cada petición. Ante un 401 que no venga de login/refresh,
 * intenta un refresco silencioso una sola vez (vía `AuthService.refrescarToken`,
 * que a su vez pide el `access_token` nuevo con la cookie `refresh_token`) y
 * reintenta la petición original con el token nuevo. Solo cierra sesión y
 * redirige al login si ese refresco también falla —el `refresh_token` de 30
 * días también venció o no existe—. Además inspecciona cabeceras de versión
 * del backend.
 */
export const tokenInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const pwaUpdateService = inject(PwaUpdateService);
  const router = inject(Router);

  const token = authService.token;
  const peticion = token
    ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
    : req;

  return next(peticion).pipe(
    tap(event => {
      // Requisito 4: Si el backend envía cabecera de actualización forzada por breaking change
      if ('headers' in event && event.headers.get('x-force-reload') === 'true') {
        void pwaUpdateService.aplicarActualizacion();
      }
    }),
    catchError(error => {
      if (error?.status !== 401 || esPeticionDeAutenticacion(req.url)) {
        return throwError(() => error);
      }

      return from(authService.refrescarToken()).pipe(
        switchMap(nuevoToken => {
          if (!nuevoToken) {
            authService.logout();
            router.navigate(['/auth/login']);
            return throwError(() => error);
          }
          const reintento = req.clone({ setHeaders: { Authorization: `Bearer ${nuevoToken}` } });
          return next(reintento);
        }),
      );
    }),
  );
};
