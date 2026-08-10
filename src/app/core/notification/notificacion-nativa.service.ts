import { Injectable, signal } from '@angular/core';

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
 *  • Insignia en barra de estado (`favicon-96x96.png`)
 *  • Reproducción de sonido de chime limpio (`/notification.wav`)
 *  • Re-enfoque de ventana al pulsar la notificación
 */
@Injectable({ providedIn: 'root' })
export class NotificacionNativaService {
  readonly permiso = signal<NotificationPermission>(
    typeof Notification !== 'undefined' ? Notification.permission : 'default',
  );

  private readonly audioChime = typeof Audio !== 'undefined' ? new Audio('/notification.wav') : null;

  constructor() {
    if (this.audioChime) {
      this.audioChime.volume = 0.6;
    }
  }

  /** Solicita permiso explícito al usuario para notificaciones nativas. */
  async solicitarPermiso(): Promise<boolean> {
    if (typeof Notification === 'undefined') {
      return false;
    }
    try {
      const res = await Notification.requestPermission();
      this.permiso.set(res);
      return res === 'granted';
    } catch {
      return false;
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
      // Fallback para Service Worker en dispositivos móviles
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
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
