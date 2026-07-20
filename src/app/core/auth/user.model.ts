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
}

/** "Maria Lopez" → "ML" */
export function generarIniciales(nombre: string): string {
  return nombre
    .split(' ')
    .map(palabra => palabra.charAt(0).toUpperCase())
    .slice(0, 2)
    .join('');
}
