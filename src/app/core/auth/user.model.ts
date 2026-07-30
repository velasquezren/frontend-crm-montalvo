/**
 * Modelo de Usuario — espejo del payload JWT del backend (auth.service.ts de NestJS).
 * Ref: CRM_MANIFESTO.md §1.1 (Dominio: auth)
 */
export type RolUsuario = 'ADMIN' | 'AGENTE';

export interface User {
  readonly id: string;
  readonly nombre: string;
  readonly email: string;
  readonly rol: RolUsuario;
  readonly iniciales: string;
  readonly foto?: string | null;
}

/**
 * Usuario tal como lo devuelve el backend (GET/PATCH /auth/perfil, /usuarios).
 * A diferencia de `User`, no incluye `iniciales` — ese campo es derivado
 * en el frontend con `generarIniciales()`.
 */
export interface UsuarioApi {
  readonly id: string;
  readonly nombre: string;
  readonly email: string;
  readonly rol: RolUsuario;
  readonly activo: boolean;
  readonly foto: string | null;
  /** Identificador de la empresa (ej. Pe2455): cruza al agente con la planilla de comisiones. */
  readonly codigo: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** "Maria Lopez" → "ML" */
export function generarIniciales(nombre: string): string {
  return nombre
    .split(' ')
    .map(palabra => palabra.charAt(0).toUpperCase())
    .slice(0, 2)
    .join('');
}
