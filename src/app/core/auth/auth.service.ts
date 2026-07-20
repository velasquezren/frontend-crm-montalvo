import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { API_URL } from '../api/api.constants';
import { generarIniciales, User } from './user.model';

interface LoginResponse {
  access_token: string;
  usuario: { sub: string; email: string; nombre: string; rol: 'ADMIN' | 'AGENTE' };
}

const TOKEN_KEY = 'crm_token';
const USER_KEY = 'crm_usuario';

/**
 * AuthService — sesión real contra el backend NestJS (POST /auth/login).
 * Estado en signals; token + usuario persisten en localStorage para
 * restaurar la sesión al recargar. El interceptor adjunta el Bearer.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);

  private readonly currentUser = signal<User | null>(this.restaurarSesion());

  readonly user = this.currentUser.asReadonly();
  readonly isAuthenticated = computed(() => this.currentUser() !== null);
  readonly isAdmin = computed(() => this.currentUser()?.rol === 'ADMIN');

  get token(): string | null {
    return localStorage.getItem(TOKEN_KEY);
  }

  async login(email: string, password: string): Promise<boolean> {
    try {
      const respuesta = await firstValueFrom(
        this.http.post<LoginResponse>(`${API_URL}/auth/login`, { email, password }),
      );

      const usuario: User = {
        id: respuesta.usuario.sub,
        nombre: respuesta.usuario.nombre,
        email: respuesta.usuario.email,
        rol: respuesta.usuario.rol,
        iniciales: generarIniciales(respuesta.usuario.nombre),
      };

      localStorage.setItem(TOKEN_KEY, respuesta.access_token);
      localStorage.setItem(USER_KEY, JSON.stringify(usuario));
      this.currentUser.set(usuario);
      return true;
    } catch {
      return false;
    }
  }

  logout(): void {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    this.currentUser.set(null);
  }

  private restaurarSesion(): User | null {
    try {
      const token = localStorage.getItem(TOKEN_KEY);
      const usuario = localStorage.getItem(USER_KEY);
      return token && usuario ? (JSON.parse(usuario) as User) : null;
    } catch {
      return null;
    }
  }
}
