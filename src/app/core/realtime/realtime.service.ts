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
    }
    destroyRef.onDestroy(() => this.desconectar());
  }

  private desconectar(): void {
    this.refCount = Math.max(0, this.refCount - 1);
    if (this.refCount === 0 && this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }
}
