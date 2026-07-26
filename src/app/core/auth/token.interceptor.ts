import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { tap, catchError, throwError } from 'rxjs';

import { AuthService } from './auth.service';
import { PwaUpdateService } from '../pwa/pwa-update.service';

/**
 * Adjunta el JWT a cada petición y, ante un 401 (token vencido/inválido),
 * cierra la sesión y redirige al login. Además inspecciona cabeceras de versión del backend.
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
      if (error?.status === 401 && !req.url.endsWith('/auth/login')) {
        authService.logout();
        router.navigate(['/auth/login']);
      }
      return throwError(() => error);
    }),
  );
};
