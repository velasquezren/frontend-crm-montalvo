import { DestroyRef, Injectable, inject, signal } from '@angular/core';
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

  private socket: Socket | null = null;
  private refCount = 0;

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

  /** Se conecta si hace falta y se desconecta solo cuando `destroyRef` se dispara. */
  conectar(destroyRef: DestroyRef): void {
    this.refCount++;
    if (!this.socket) {
      this.socket = io(`${API_URL}/realtime`, {
        auth: { token: this.authService.token },
        transports: ['websocket'],
      });
      this.socket.on('conversacion:actividad', (payload: { conversacionId: string }) => {
        this.actividad.set({ conversacionId: payload.conversacionId, ts: Date.now() });
      });
      this.socket.on('actividad:recordatorio', (payload: { actividadId: string; agenteId: string }) => {
        this.recordatorioActividad.set({ ...payload, ts: Date.now() });
      });
      this.socket.on('connect', () => {
        this.conectado.set(true);
        if (this.yaConectoUnaVez) {
          this.reconectado.update(n => n + 1);
        }
        this.yaConectoUnaVez = true;
      });
      this.socket.on('disconnect', () => this.conectado.set(false));
    }
    destroyRef.onDestroy(() => this.desconectar());
  }

  private desconectar(): void {
    this.refCount = Math.max(0, this.refCount - 1);
    if (this.refCount === 0 && this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.yaConectoUnaVez = false;
      this.conectado.set(false);
    }
  }
}
