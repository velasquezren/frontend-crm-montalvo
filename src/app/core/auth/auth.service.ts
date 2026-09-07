import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { API_URL } from '../api/api.constants';
import { limpiarCacheApi } from '../api/cache.interceptor';
import { cubreRol } from './roles';
import { generarIniciales, RolUsuario, User } from './user.model';

interface LoginResponse {
  access_token: string;
  usuario: { sub: string; email: string; nombre: string; rol: RolUsuario; foto: string | null };
}

const TOKEN_KEY = 'crm_token';
const USER_KEY = 'crm_usuario';

/**
 * Último correo que entró con "Recordarme" marcado.
 *
 * Va aparte del token y **sobrevive al logout** a propósito: eso es lo que
 * significa recordar a alguien. El token se borra al salir; saber quién eras, no.
 *
 * Aquí NUNCA va la contraseña. De guardarla se encarga el gestor del navegador,
 * que para eso el formulario declara `autocomplete="current-password"` sobre un
 * <form> real con submit — el navegador ofrece guardarla y la rellena solo.
 * Guardarla nosotros sería ponerla en texto plano en el mismo equipo que
 * comparten varias agentes.
 */
const EMAIL_KEY = 'crm_ultimo_email';

/**
 * AuthService — sesión real contra el backend NestJS (POST /auth/login).
 * Estado en signals; token + usuario persisten en localStorage para
 * restaurar la sesión al recargar. El interceptor adjunta el Bearer.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);

  private readonly currentUser = signal<User | null>(this.restaurarSesion());
  private readonly revision = signal(0);
  readonly generacionSesion = this.revision.asReadonly();

  readonly user = this.currentUser.asReadonly();
  readonly isAuthenticated = computed(() => this.currentUser() !== null);
  /** De ADMIN para arriba — un super admin puede todo lo que puede un admin. */
  readonly isAdmin = computed(() => cubreRol(this.currentUser()?.rol, 'ADMIN'));
  /** Solo el super admin: gestiona agentes (y sus códigos) e importa la planilla. */
  readonly isSuperAdmin = computed(() => cubreRol(this.currentUser()?.rol, 'SUPER_ADMIN'));

  get token(): string | null {
    return localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY);
  }

  /** Correo con el que entró la última vez, para precargar el login. */
  get ultimoEmail(): string {
    return localStorage.getItem(EMAIL_KEY) ?? '';
  }

  async login(email: string, password: string, rememberMe = true): Promise<boolean> {
    this.revision.update(n => n + 1);
    this.refrescoEnCurso = null;
    const generacion = this.revision();
    try {
      const respuesta = await firstValueFrom(
        this.http.post<LoginResponse>(`${API_URL}/auth/login`, { email, password, rememberMe }, { withCredentials: true }),
      );
      if (generacion !== this.revision()) return false;
      this.revision.update(n => n + 1);
      this.refrescoEnCurso = null;

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

      /* "Recordarme" también recuerda QUIÉN eres, no solo la sesión. Sin esto
         el checkbox no tenía ningún efecto visible al volver: la pantalla salía
         en blanco y había que teclear el correo entero otra vez.
         Sin marcar, se borra: en la clínica varias agentes comparten equipo y
         dejar el correo de otra en el campo no es recordar, es estorbar. */
      if (rememberMe) {
        localStorage.setItem(EMAIL_KEY, email.trim());
      } else {
        localStorage.removeItem(EMAIL_KEY);
      }

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

  /** Refresco en curso — compartido para que 401 simultáneos no disparen N llamadas. */
  private refrescoEnCurso: Promise<string | null> | null = null;

  /**
   * Pide un `access_token` nuevo con el `refresh_token` (cookie HttpOnly: el
   * navegador la manda solo, este código nunca la toca). La usa el
   * interceptor cuando una petición vuelve con 401.
   *
   * Deduplicado a propósito: si varias peticiones expiran a la vez, todas
   * esperan el mismo refresco. Solo 401 devuelve null; un fallo operativo se
   * propaga y conserva la sesión. Una respuesta de otra generación se descarta.
   */
  refrescarToken(): Promise<string | null> {
    if (!this.token) return Promise.resolve(null);
    if (!this.refrescoEnCurso) {
      const pendiente = this.ejecutarRefresco(this.revision()).finally(() => {
        if (this.refrescoEnCurso === pendiente) this.refrescoEnCurso = null;
      });
      this.refrescoEnCurso = pendiente;
    }
    return this.refrescoEnCurso;
  }

  private async ejecutarRefresco(generacion: number): Promise<string | null> {
    try {
      const respuesta = await firstValueFrom(
        this.http.post<LoginResponse>(
          `${API_URL}/auth/refresh`,
          {},
          { withCredentials: true },
        ),
      );
      if (generacion !== this.revision()) throw this.sesionCambio();

      const usuario: User = {
        id: respuesta.usuario.sub,
        nombre: respuesta.usuario.nombre,
        email: respuesta.usuario.email,
        rol: respuesta.usuario.rol,
        iniciales: generarIniciales(respuesta.usuario.nombre),
        foto: respuesta.usuario.foto,
      };

      // La sesión ya vivía en localStorage o sessionStorage: se actualiza la misma.
      const storage = localStorage.getItem(TOKEN_KEY) ? localStorage : sessionStorage;
      storage.setItem(TOKEN_KEY, respuesta.access_token);
      storage.setItem(USER_KEY, JSON.stringify(usuario));

      this.currentUser.set(usuario);
      return respuesta.access_token;
    } catch (error) {
      if (generacion !== this.revision()) throw this.sesionCambio();
      if (error instanceof HttpErrorResponse && error.status === 401) return null;
      throw error;
    }
  }

  private sesionCambio(): HttpErrorResponse {
    return new HttpErrorResponse({ status: 409, statusText: 'La sesión cambió durante la petición' });
  }

  logout(): void {
    this.revision.update(n => n + 1);
    this.refrescoEnCurso = null;
    /* Pide revocar esta sesión y borrar su cookie HttpOnly. El estado local se
       limpia sin esperar a la red; si la petición falla, esa limpieza local no
       demuestra que el servidor haya revocado la credencial. */
    this.http
      .post(`${API_URL}/auth/logout`, {}, { withCredentials: true })
      .subscribe({ error: () => undefined });

    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(USER_KEY);
    this.currentUser.set(null);
    /* En la clínica varias agentes comparten equipo: sin esto, los datos que
       cargó una seguirían en memoria para la siguiente. */
    limpiarCacheApi();
  }

  /**
   * Comprueba contra el servidor si el rol guardado sigue siendo el real.
   *
   * El navegador conserva el usuario para pintar sin bloquear el arranque.
   * El backend comprueba la versión de sesión y rechaza con 401 los tokens
   * revocados por un cambio de rol; el interceptor resuelve ese caso. Aquí se
   * actualiza el perfil visible y se descartan respuestas de otra sesión.
   * Un fallo de red no borra el estado local.
   */
  async sincronizarRol(): Promise<{ rolCambio: boolean }> {
    const actual = this.currentUser();
    const generacion = this.revision();
    if (!actual) return { rolCambio: false };

    try {
      const perfil = await firstValueFrom(
        this.http.get<{ rol: RolUsuario; nombre: string; foto: string | null }>(
          `${API_URL}/auth/perfil`,
        ),
      );
      if (generacion !== this.revision()) return { rolCambio: false };

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
