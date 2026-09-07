import { DestroyRef, Injectable, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { io, Socket } from 'socket.io-client';

import { API_URL } from '../api/api.constants';
import { AuthService } from '../auth/auth.service';

/** Aviso de actividad nueva en una conversación — sin datos del paciente,
 *  ver la nota en `conversaciones.gateway.ts` del backend. */
export interface ActividadConversacion {
  readonly conversacionId: string;
  /** Distingue avisos repetidos del mismo id para que un `effect()` los note. */
  readonly ts: number;
}

/** Un recordatorio de `Actividad` (módulo Actividades) entró en su ventana de
 *  aviso. `agenteId` viaja para descartar sin pedir nada si no es de quien
 *  mira — ver la nota en `conversaciones.gateway.ts` del backend. */
export interface RecordatorioActividad {
  readonly actividadId: string;
  readonly agenteId: string;
  readonly ts: number;
}

/**
 * RealtimeService — cliente de WebSocket para el inbox de Conversaciones.
 *
 * Reemplaza el refresco ciego por polling (antes cada 15s, siempre, aunque
 * no hubiera nada nuevo) por un aviso empujado por el backend en cuanto se
 * crea un mensaje: el reload pasa de tardar hasta 15s a ser casi instantáneo.
 *
 * Un solo socket compartido por toda la sesión (`refCount`), igual que
 * `DialogService` con el overlay: cada página que lo usa se conecta al
 * entrar y `DestroyRef` lo desconecta solo cuando el último suscriptor se va,
 * sin que cada página tenga que acordarse de un `OnDestroy`.
 */
@Injectable({ providedIn: 'root' })
export class RealtimeService {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  private socket: Socket | null = null;
  private refCount = 0;
  private generacionConectada: number | null = null;
  private reintento?: ReturnType<typeof setTimeout>;
  private demora = 1000;
  private renovando: Socket | null = null;
  private tokenRecienRenovado = false;

  /** Último aviso recibido; un `effect()` en la página lo consume y decide qué recargar. */
  readonly actividad = signal<ActividadConversacion | null>(null);

  /** Último recordatorio de Actividad recibido — lo consume `app-notificaciones-bell`. */
  readonly recordatorioActividad = signal<RecordatorioActividad | null>(null);

  /** Contador de reconexiones (0 = todavía ninguna). Sube cada vez que el socket
   *  vuelve a conectar tras una caída — un wifi que parpadea, la laptop que se
   *  suspende — para que la página haga un reload completo y recupere lo que
   *  se perdió mientras estuvo desconectada, en vez de confiar solo en el
   *  polling de respaldo de 60s. */
  readonly reconectado = signal(0);

  /**
   * Si el canal de tiempo real está vivo ahora mismo.
   *
   * Lo consume el respaldo por temporizador de Conversaciones para dejar de
   * preguntar cuando el socket ya está avisando. socket.io mantiene su propio
   * ping/pong, así que una conexión zombi —abierta pero muerta— acaba
   * disparando `disconnect` y esto vuelve a false; por eso el respaldo puede
   * fiarse de esta señal sin quedarse mudo para siempre.
   */
  readonly conectado = signal(false);

  private yaConectoUnaVez = false;

  constructor() {
    effect(() => {
      const generacion = this.authService.generacionSesion();
      const usuario = this.authService.user();
      if (this.socket && (generacion !== this.generacionConectada || !usuario)) this.cerrarSocket();
      if (this.refCount > 0 && usuario && !this.socket) this.abrirSocket();
    });
  }

  /** Se conecta si hace falta y se desconecta solo cuando `destroyRef` se dispara. */
  conectar(destroyRef: DestroyRef): void {
    this.refCount++;
    if (!this.socket && this.authService.user()) this.abrirSocket();
    destroyRef.onDestroy(() => this.desconectar());
  }

  private abrirSocket(): void {
    const socket = io(`${API_URL}/realtime`, {
      auth: callback => callback({ token: this.authService.token }),
      transports: ['websocket'],
      autoConnect: false,
      reconnection: false,
    });
    this.socket = socket;
    const generacion = this.authService.generacionSesion();
    this.generacionConectada = generacion;
    socket.on('conversacion:actividad', (payload: { conversacionId: string }) => {
      if (!this.sigueVigente(socket, generacion)) return;
      this.actividad.set({ conversacionId: payload.conversacionId, ts: Date.now() });
    });
    socket.on('actividad:recordatorio', (payload: { actividadId: string; agenteId: string }) => {
      if (!this.sigueVigente(socket, generacion)) return;
      this.recordatorioActividad.set({ ...payload, ts: Date.now() });
    });
    socket.on('connect', () => {
      if (!this.sigueVigente(socket, generacion)) return;
      this.tokenRecienRenovado = false;
      clearTimeout(this.reintento);
      this.demora = 1000;
      this.conectado.set(true);
      if (this.yaConectoUnaVez) {
        this.reconectado.update(n => n + 1);
      }
      this.yaConectoUnaVez = true;
    });
    socket.on('connect_error', (error: Error & { data?: { status?: number } }) => {
      if (!this.sigueVigente(socket, generacion)) return;
      this.conectado.set(false);
      if (error.data?.status === 401 && this.tokenRecienRenovado) {
        this.authService.logout();
        void this.router.navigate(['/auth/login']);
      } else if (error.data?.status === 401) void this.renovar(socket, generacion);
      else this.programarReconexion(socket, generacion);
    });
    socket.on('disconnect', (motivo: string) => {
      if (!this.sigueVigente(socket, generacion)) return;
      this.conectado.set(false);
      if (motivo === 'io server disconnect') void this.renovar(socket, generacion);
      else if (motivo !== 'io client disconnect') this.programarReconexion(socket, generacion);
    });
    socket.connect();
  }

  private sigueVigente(socket: Socket, generacion: number): boolean {
    return this.socket === socket && this.refCount > 0 && this.authService.user() !== null &&
      generacion === this.authService.generacionSesion();
  }

  private async renovar(socket: Socket, generacion: number): Promise<void> {
    if (!this.sigueVigente(socket, generacion) || this.renovando === socket) return;
    this.renovando = socket;
    try {
      const token = await this.authService.refrescarToken();
      if (!this.sigueVigente(socket, generacion)) return;
      if (token) {
        this.tokenRecienRenovado = true;
        socket.connect();
      }
      else {
        this.authService.logout();
        void this.router.navigate(['/auth/login']);
      }
    } catch {
      this.programarReconexion(socket, generacion);
    } finally {
      if (this.renovando === socket) this.renovando = null;
    }
  }

  private programarReconexion(socket: Socket, generacion: number): void {
    if (!this.sigueVigente(socket, generacion)) return;
    clearTimeout(this.reintento);
    this.reintento = setTimeout(() => {
      if (this.sigueVigente(socket, generacion)) socket.connect();
    }, this.demora);
    this.demora = Math.min(this.demora * 2, 30_000);
  }

  private cerrarSocket(): void {
    clearTimeout(this.reintento);
    this.socket?.removeAllListeners();
    this.socket?.disconnect();
    this.socket = null;
    this.renovando = null;
    this.tokenRecienRenovado = false;
    this.generacionConectada = null;
    this.yaConectoUnaVez = false;
    this.demora = 1000;
    this.conectado.set(false);
    this.actividad.set(null);
    this.recordatorioActividad.set(null);
    this.reconectado.set(0);
  }

  private desconectar(): void {
    this.refCount = Math.max(0, this.refCount - 1);
    if (this.refCount === 0) this.cerrarSocket();
  }
}
