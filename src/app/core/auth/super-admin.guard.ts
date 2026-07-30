import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { AuthService } from './auth.service';

/**
 * Solo super administradores — gestión de agentes (donde se asignan los códigos
 * de empresa) e importación de la planilla.
 *
 * Es únicamente para no mostrar lo que el usuario no puede usar: quien decide
 * de verdad es el backend con `@Roles('SUPER_ADMIN')`.
 */
export const superAdminGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (authService.isSuperAdmin()) {
    return true;
  }
  return router.createUrlTree(['/dashboard']);
};
