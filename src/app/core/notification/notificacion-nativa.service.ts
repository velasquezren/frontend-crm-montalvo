import { inject, Injectable, signal } from '@angular/core';
import { ApiService } from '../api/api.service';

export interface NotificacionNativaOptions {
  titulo: string;
  mensaje: string;
  icono?: string;
  badge?: string;
  tag?: string;
  data?: Record<string, unknown>;
  alHacerClic?: () => void;
}

/**
 * Servicio centralizado de Notificaciones Nativas (Desktop + Móvil PWA).
 *
 * Mantiene la fidelidad visual de una App de Teléfono Nativa:
 *  • Cabecera e icono institucional (`web-app-manifest-192x192.png`)
 *  • Insignia en barra de estado / icono PWA (`setAppBadge`)
 *  • Reproducción de sonido de chime limpio (`/notification.wav`)
 *  • Registro de Web Push (VAPID) mediante Service Worker
 */
@Injectable({ providedIn: 'root' })
export class NotificacionNativaService {
  private readonly api = inject(ApiService);

  readonly permiso = signal<NotificationPermission>(
    typeof Notification !== 'undefined' ? Notification.permission : 'default',
  );

  private readonly audioChime = typeof Audio !== 'undefined' ? new Audio('/notification.wav') : null;

  constructor() {
    if (this.audioChime) {
      this.audioChime.volume = 0.6;
    }
  }

  /** Solicita permiso explícito al usuario para notificaciones nativas y Web Push. */
  async solicitarPermiso(): Promise<boolean> {
    if (typeof Notification === 'undefined') {
      return false;
    }
    try {
      const res = await Notification.requestPermission();
      this.permiso.set(res);
      if (res === 'granted') {
        void this.registrarServiceWorkerYVapid();
      }
      return res === 'granted';
    } catch {
      return false;
    }
  }

  /**
   * Registra el Service Worker de la PWA (`/sw.js`) y realiza el enrolamiento VAPID Web Push.
   * Permite recibir avisos incluso si el navegador/pestaña está cerrado por completo.
   */
  async registrarServiceWorkerYVapid(): Promise<void> {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) {
      return;
    }

    try {
      const reg = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;

      // Obtener llave pública VAPID del backend
      const resKey = await this.api.get<{ publicKey: string }>('push/public-key');
      if (!resKey?.publicKey) return;

      const subExistente = await reg.pushManager.getSubscription();
      if (subExistente) {
        // Enviar suscripción existente al backend
        const subJson = subExistente.toJSON();
        if (subJson.endpoint && subJson.keys?.p256dh && subJson.keys?.auth) {
          await this.api.post('push/suscribir', {
            endpoint: subJson.endpoint,
            keys: { p256dh: subJson.keys.p256dh, auth: subJson.keys.auth },
          });
        }
        return;
      }

      // Crear nueva suscripción VAPID
      const nuevaSub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(resKey.publicKey),
      });

      const nuevaSubJson = nuevaSub.toJSON();
      if (nuevaSubJson.endpoint && nuevaSubJson.keys?.p256dh && nuevaSubJson.keys?.auth) {
        await this.api.post('push/suscribir', {
          endpoint: nuevaSubJson.endpoint,
          keys: { p256dh: nuevaSubJson.keys.p256dh, auth: nuevaSubJson.keys.auth },
        });
      }
    } catch {
      // Ignorar rechazos puntuales o modo privado
    }
  }

  /** Reproduce el chime de audio nativo. */
  reproducirSonido(): void {
    if (!this.audioChime) return;
    try {
      this.audioChime.currentTime = 0;
      void this.audioChime.play().catch(() => undefined);
    } catch {
      // Ignorar bloqueos de autoplay del navegador
    }
  }

  /** Actualiza el contador / globo rojo en el icono de la App PWA instalada (`App Badging API`). */
  actualizarBadge(count: number): void {
    if (typeof navigator !== 'undefined' && 'setAppBadge' in navigator) {
      if (count > 0) {
        void navigator.setAppBadge(count).catch(() => undefined);
      } else {
        void navigator.clearAppBadge().catch(() => undefined);
      }
    }
  }

  /** Limpia el globo rojo de notificaciones del icono. */
  limpiarBadge(): void {
    if (typeof navigator !== 'undefined' && 'clearAppBadge' in navigator) {
      void navigator.clearAppBadge().catch(() => undefined);
    }
  }

  /** Dispara una notificación nativa con aspecto de app de teléfono. */
  mostrar(options: NotificacionNativaOptions): void {
    // 1) Reproducir chime si la pantalla está en segundo plano o minimizada
    if (document.hidden) {
      this.reproducirSonido();
    }

    // 2) Verificar soporte y permiso concedido
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') {
      return;
    }

    const icono = options.icono ?? '/web-app-manifest-192x192.png';
    const badge = options.badge ?? '/favicon-96x96.png';

    try {
      const notifOpts: NotificationOptions & { renotify?: boolean } = {
        body: options.mensaje,
        icon: icono,
        badge: badge,
        tag: options.tag ?? 'crm-montalvo-notif',
        renotify: true,
        data: options.data,
      };
      const notif = new Notification(options.titulo, notifOpts);

      notif.onclick = (evt) => {
        evt.preventDefault();
        window.focus();
        if (options.alHacerClic) {
          options.alHacerClic();
        }
        notif.close();
      };
    } catch {
      // Fallback para Service Worker en dispositivos móviles / PWA
      if ('serviceWorker' in navigator) {
        void navigator.serviceWorker.ready.then((reg) => {
          void reg.showNotification(options.titulo, {
            body: options.mensaje,
            icon: icono,
            badge: badge,
            tag: options.tag ?? 'crm-montalvo-notif',
            data: options.data,
          });
        });
      }
    }
  }
}

/** Auxiliar para convertir llaves VAPID base64url a Uint8Array */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
