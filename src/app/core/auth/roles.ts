import { inject } from '@angular/core';
import { CanActivateFn, Route, Router } from '@angular/router';

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
  RECEPCION: 0,
  /* Mismo rango que recepción: opera sus líneas, sin alcance comercial. Lo que
     puede hacer un asistente NO se deduce del rango —está por debajo de un
     agente— sino de su acceso a la línea, que resuelve el backend. */
  ASISTENTE: 0,
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
  RECEPCION: 'Recepción',
  ASISTENTE: 'Asistente',
  AGENTE: 'Agente',
};

/**
 * Guard de rol que además **recuerda qué rol exige**. Lo lee `PreloadPorRol`
 * para no descargar por adelantado rutas que este usuario no puede abrir.
 *
 * La propiedad existe para que el rol siga viviendo en UN solo sitio —la
 * definición de la ruta—. La alternativa era repetirlo en `data: { rol }`, y un
 * `canActivate` y un `data` que dicen cosas distintas es exactamente el tipo de
 * deriva que aquí se corrige con validadores, no con disciplina.
 */
/** Espejo de `ROLES_ENTREGA_RESULTADOS` del backend. */
const ROLES_ENTREGA_RESULTADOS: readonly RolUsuario[] = ['ASISTENTE'];

/**
 * ¿Este rol entrega resultados médicos? Espejo de `puedeEntregarResultados`
 * del backend (`common/auth/roles.ts`), que es quien decide de verdad —y además
 * exige acceso a la línea de resultados—.
 *
 * Es una capacidad, no un rango: el asistente está por debajo de un agente de
 * ventas y aun así es quien entrega. Ni recepción ni ventas, aunque atiendan la
 * línea de Recepción por la que sale el aviso.
 */
export function puedeEntregarResultados(rol: RolUsuario | undefined): boolean {
  return cubreRol(rol, 'ADMIN') || (rol !== undefined && ROLES_ENTREGA_RESULTADOS.includes(rol));
}


/**
 * Roles OPERATIVOS: atienden los chats de sus líneas, sin alcance comercial
 * (sin leads, sin fichas completas, sin la línea de ventas). Espejo de
 * `ROLES_OPERATIVOS` del backend.
 *
 * Lista única a propósito, como allí: al añadir ASISTENTE, las tres
 * comparaciones sueltas con `'RECEPCION'` que había en este frontend lo
 * dejaron fuera —no se podía crear la cuenta, el formulario le ofrecía la
 * línea comercial y el selector de Actividades le llamaba endpoints de ventas—.
 * `check:skills` rechaza ahora comparar un rol con un literal fuera de aquí.
 */
export const ROLES_OPERATIVOS: readonly RolUsuario[] = ['RECEPCION', 'ASISTENTE'];

export function esRolOperativo(rol: RolUsuario | undefined): boolean {
  return rol !== undefined && ROLES_OPERATIVOS.includes(rol);
}

/**
 * ¿Ve la agenda COMPLETA de la clínica (pantalla Reservas)? Espejo de
 * `puedeVerAgendaClinica` del backend: quien gestiona las citas —recepción,
 * asistencia y administración—. Una agente de ventas ve las reservas de una
 * paciente solo desde su chat. Capacidad, no rango: recepción está por debajo
 * de una agente y es quien confirma las citas.
 */
export function puedeVerAgendaClinica(rol: RolUsuario | undefined): boolean {
  return cubreRol(rol, 'ADMIN') || esRolOperativo(rol);
}

/** Espejo de `ROLES_ADMINISTRAN_AGENDA` del backend. */
const ROLES_ADMINISTRAN_AGENDA: readonly RolUsuario[] = ['RECEPCION'];

/**
 * ¿Edita médicos, horarios y especialidades de la agenda (Directorio médico)?
 * Espejo de `puedeEditarAgendaClinica` del backend: administración y
 * recepción. Asistencia los ve pero no los edita. Capacidad, no rango.
 */
export function puedeEditarAgendaClinica(rol: RolUsuario | undefined): boolean {
  return cubreRol(rol, 'ADMIN') || (rol !== undefined && ROLES_ADMINISTRAN_AGENDA.includes(rol));
}

/** Guard de `/reservas`: quien no gestiona citas vuelve a su bandeja. */
export const exigeAgendaClinica: CanActivateFn = () =>
  puedeVerAgendaClinica(inject(AuthService).user()?.rol) || inject(Router).createUrlTree(['/conversaciones']);

/** Guard de `/resultados`: quien no entrega vuelve a su bandeja, no a una pantalla de error. */
export const exigeEntregaResultados: CanActivateFn = () =>
  puedeEntregarResultados(inject(AuthService).user()?.rol) || inject(Router).createUrlTree(['/conversaciones']);

export type GuardDeRol = CanActivateFn & { readonly rolMinimo: RolUsuario };

/**
 * Crea un guard que exige un rol mínimo. Sustituye a los guards por rol, que
 * eran el mismo archivo copiado cambiando una comparación.
 *
 * ```ts
 * { path: 'agentes', canActivate: [exigeRol('SUPER_ADMIN')], … }
 * ```
 */
export function exigeRol(rolMinimo: RolUsuario): GuardDeRol {
  const guard: CanActivateFn = () => {
    const authService = inject(AuthService);
    const router = inject(Router);

    return cubreRol(authService.user()?.rol, rolMinimo) || router.createUrlTree(['/conversaciones']);
  };

  return Object.assign(guard, { rolMinimo });
}

/**
 * Rol mínimo que declara una ruta, o `undefined` si no exige ninguno.
 *
 * Solo reconoce los guards creados por `exigeRol()`: un `canActivate` escrito a
 * mano no se adivina, y ante la duda la ruta se trata como abierta —precargar
 * de más es lento, precargar de menos sería una navegación en frío—.
 */
export function rolExigidoPor(ruta: Route): RolUsuario | undefined {
  return ruta.canActivate?.find((g): g is GuardDeRol => typeof g === 'function' && 'rolMinimo' in g)
    ?.rolMinimo;
}
