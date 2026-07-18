/**
 * Modelo de Usuario — Clínica Montalvo CRM
 * Ref: CRM_MANIFESTO.md §1.1 (Dominio: auth)
 */
export interface User {
  readonly id: string;
  readonly nombre: string;
  readonly email: string;
  readonly rol: 'admin' | 'agente';
  readonly iniciales: string;
}
