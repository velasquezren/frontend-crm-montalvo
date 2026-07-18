import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { AuthService } from './auth.service';

/**
 * Auth Guard — Protección funcional de rutas (CanActivateFn)
 * Ref: CRM_MANIFESTO.md §2.7 — Guards como funciones, no clases
 *
 * Redirige a /auth/login si no hay sesión activa en AuthService.
 */
export const authGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (authService.isAuthenticated()) {
    return true;
  }

  return router.createUrlTree(['/auth/login']);
};
