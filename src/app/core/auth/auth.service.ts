import { computed, Injectable, signal } from '@angular/core';

import { User } from './user.model';

/**
 * AuthService — Estado de sesión basado en Signals
 * Ref: CRM_MANIFESTO.md §2.2 (signal para estado, computed para derivados)
 *
 * Mock: Acepta cualquier email/password y genera un usuario a partir del email.
 * Se reemplazará por integración real con el backend NestJS (JWT).
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly currentUser = signal<User | null>(null);

  /** Signal de solo lectura del usuario actual */
  readonly user = this.currentUser.asReadonly();

  /** Estado derivado — true si hay sesión activa */
  readonly isAuthenticated = computed(() => this.currentUser() !== null);

  /**
   * Mock login — genera un usuario a partir del email.
   * Emails con "admin" asignan rol 'admin', el resto 'agente'.
   */
  login(email: string, _password: string): boolean {
    const nombre = this.extractNameFromEmail(email);
    const iniciales = this.generateInitials(nombre);

    this.currentUser.set({
      id: crypto.randomUUID(),
      nombre,
      email,
      rol: email.toLowerCase().includes('admin') ? 'admin' : 'agente',
      iniciales,
    });

    return true;
  }

  /** Cierra la sesión actual */
  logout(): void {
    this.currentUser.set(null);
  }

  /**
   * Extrae un nombre legible del email.
   * "maria.lopez@clinica.com" → "Maria Lopez"
   */
  private extractNameFromEmail(email: string): string {
    const localPart = email.split('@')[0];
    return localPart
      .split(/[._-]/)
      .map(segment => segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase())
      .join(' ');
  }

  /**
   * Genera iniciales (máximo 2 caracteres).
   * "Maria Lopez" → "ML"
   */
  private generateInitials(nombre: string): string {
    return nombre
      .split(' ')
      .map(word => word.charAt(0).toUpperCase())
      .slice(0, 2)
      .join('');
  }
}
