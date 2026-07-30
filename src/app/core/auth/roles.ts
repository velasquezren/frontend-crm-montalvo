import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { AuthService } from './auth.service';
import { RolUsuario } from './user.model';

/**
 * Jerarquía de roles del frontend — espejo de `common/auth/roles.ts` del backend.
 *
 * Aquí solo se decide QUÉ SE MUESTRA; quien autoriza de verdad es el backend
 * (`RolesGuard` + `@Roles`). Mantener ambas listas alineadas es la única regla:
 * si añades un rol allá, añádelo aquí.
 */
export const RANGO_ROL: Readonly<Record<RolUsuario, number>> = {
  AGENTE: 1,
  ADMIN: 2,
  SUPER_ADMIN: 3,
};

/** ¿`rol` alcanza el nivel de `rolMinimo`? */
export function cubreRol(rol: RolUsuario | undefined, rolMinimo: RolUsuario): boolean {
  return rol !== undefined && RANGO_ROL[rol] >= RANGO_ROL[rolMinimo];
}

/** Etiquetas de rol — fuente única para badges y textos de la interfaz. */
export const ROL_LABEL: Readonly<Record<RolUsuario, string>> = {
  SUPER_ADMIN: 'Super administrador',
  ADMIN: 'Administrador',
  AGENTE: 'Agente',
};

/**
 * Crea un guard que exige un rol mínimo. Sustituye a los guards por rol, que
 * eran el mismo archivo copiado cambiando una comparación.
 *
 * ```ts
 * { path: 'agentes', canActivate: [exigeRol('SUPER_ADMIN')], … }
 * ```
 */
export function exigeRol(rolMinimo: RolUsuario): CanActivateFn {
  return () => {
    const authService = inject(AuthService);
    const router = inject(Router);

    return cubreRol(authService.user()?.rol, rolMinimo) || router.createUrlTree(['/dashboard']);
  };
}
