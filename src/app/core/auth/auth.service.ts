import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { API_URL } from '../api/api.constants';
import { generarIniciales, RolUsuario, User } from './user.model';

interface LoginResponse {
  access_token: string;
  usuario: { sub: string; email: string; nombre: string; rol: RolUsuario; foto: string | null };
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
  /** Un SUPER_ADMIN también es admin: la jerarquía se respeta en toda la UI. */
  readonly isAdmin = computed(() => {
    const rol = this.currentUser()?.rol;
    return rol === 'ADMIN' || rol === 'SUPER_ADMIN';
  });
  /** Solo el super admin: gestiona agentes (y sus códigos) e importa la planilla. */
  readonly isSuperAdmin = computed(() => this.currentUser()?.rol === 'SUPER_ADMIN');

  get token(): string | null {
    return localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY);
  }

  async login(email: string, password: string, rememberMe = true): Promise<boolean> {
    try {
      const respuesta = await firstValueFrom(
        this.http.post<LoginResponse>(`${API_URL}/auth/login`, { email, password, rememberMe }),
      );

      const usuario: User = {
        id: respuesta.usuario.sub,
        nombre: respuesta.usuario.nombre,
        email: respuesta.usuario.email,
        rol: respuesta.usuario.rol,
        iniciales: generarIniciales(respuesta.usuario.nombre),
        foto: respuesta.usuario.foto,
      };

      const storage = rememberMe ? localStorage : sessionStorage;
      // Limpiar storage opuesto para evitar inconsistencias
      const storageOpuesto = rememberMe ? sessionStorage : localStorage;
      storageOpuesto.removeItem(TOKEN_KEY);
      storageOpuesto.removeItem(USER_KEY);

      storage.setItem(TOKEN_KEY, respuesta.access_token);
      storage.setItem(USER_KEY, JSON.stringify(usuario));
      this.currentUser.set(usuario);
      return true;
    } catch {
      return false;
    }
  }

  actualizarUsuarioLocal(nuevoUsuario: User): void {
    if (localStorage.getItem(TOKEN_KEY)) {
      localStorage.setItem(USER_KEY, JSON.stringify(nuevoUsuario));
    } else {
      sessionStorage.setItem(USER_KEY, JSON.stringify(nuevoUsuario));
    }
    this.currentUser.set(nuevoUsuario);
  }

  logout(): void {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(USER_KEY);
    this.currentUser.set(null);
  }

  /**
   * Comprueba contra el servidor si el rol guardado sigue siendo el real.
   *
   * El rol viaja DENTRO del JWT (que dura 8h) y además se cachea en el
   * navegador, así que un cambio de rol no se nota hasta volver a entrar: el
   * menú muestra opciones que el backend rechazará, o esconde otras que la
   * persona ya tiene. Al arrancar la app se contrasta con `/auth/perfil` y,
   * si no coinciden, se cierra la sesión para que vuelva a entrar con un token
   * coherente. Nunca cierra sesión por un fallo de red: solo si el servidor
   * responde y el rol es distinto.
   */
  async sincronizarRol(): Promise<{ rolCambio: boolean }> {
    const actual = this.currentUser();
    if (!actual) return { rolCambio: false };

    try {
      const perfil = await firstValueFrom(
        this.http.get<{ rol: RolUsuario; nombre: string; foto: string | null }>(
          `${API_URL}/auth/perfil`,
        ),
      );

      if (perfil.rol !== actual.rol) {
        this.logout();
        return { rolCambio: true };
      }

      // Aprovecha para refrescar nombre y foto sin tocar el rol ni el token.
      if (perfil.nombre !== actual.nombre || perfil.foto !== actual.foto) {
        this.actualizarUsuarioLocal({
          ...actual,
          nombre: perfil.nombre,
          foto: perfil.foto,
          iniciales: generarIniciales(perfil.nombre),
        });
      }
      return { rolCambio: false };
    } catch {
      // Sin conexión o token ya expirado: lo resuelve el interceptor, no aquí.
      return { rolCambio: false };
    }
  }

  private restaurarSesion(): User | null {
    try {
      const token = this.token;
      const usuarioStr = localStorage.getItem(USER_KEY) || sessionStorage.getItem(USER_KEY);
      return token && usuarioStr ? (JSON.parse(usuarioStr) as User) : null;
    } catch {
      return null;
    }
  }
}
