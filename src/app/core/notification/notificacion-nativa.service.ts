import { inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { SwPush } from '@angular/service-worker';
import { firstValueFrom, take } from 'rxjs';

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
  private readonly swPush = inject(SwPush);

  readonly permiso = signal<NotificationPermission>(
    typeof Notification !== 'undefined' ? Notification.permission : 'default',
  );

  private readonly audioChime = typeof Audio !== 'undefined' ? new Audio('/notification.wav') : null;

  /**
   * El endpoint de la suscripción vigente, para poder darla de baja SIN esperar.
   *
   * `swPush.subscription` es un observable: preguntarle en el momento del
   * logout devolvería la respuesta un tick tarde, cuando el token ya no está.
   * Esto no es un segundo estado —la fuente sigue siendo `swPush`—, es su
   * último valor guardado para poder leerlo de forma síncrona.
   */
  private endpointSuscrito: string | null = null;

  constructor() {
    if (this.audioChime) {
      this.audioChime.volume = 0.6;
    }
    if (this.swPush.isEnabled) {
      this.swPush.subscription
        .pipe(takeUntilDestroyed())
        .subscribe(sub => (this.endpointSuscrito = sub?.endpoint ?? null));
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
   * Enrola el dispositivo en Web Push (VAPID) sobre el Service Worker de Angular.
   *
   * **Aquí NO se registra ningún Service Worker, y es el punto entero de F09.**
   * Antes esto hacía `navigator.serviceWorker.register('/sw.js')`, y el
   * `provideServiceWorker('ngsw-worker.js')` de `app.config.ts` registraba el
   * suyo en el MISMO scope `/`. Un scope solo admite una registración, así que
   * se sustituían: como esto se llama cada vez que una agente abre el inbox y
   * ngsw se registra en cada carga, se turnaban a diario. Con ngsw activo el
   * push no mostraba nada —`handlePush` hace `return` si el payload no trae
   * `notification.title`— y con el propio activo moría `SwUpdate`, o sea los
   * avisos de versión nueva. Las dos mitades rotas, alternándose, en silencio.
   *
   * Ahora hay un solo Service Worker, el de Angular, y `SwPush` se monta encima
   * de él. **No vuelvas a llamar a `serviceWorker.register` desde el código de
   * la app**: lo impide `check:skills` (`verificarServiceWorkerUnico` en
   * `tools/verificar-skills.mjs`), que además rechaza que `public/sw.js` vuelva
   * a aparecer y que `app.config.ts` deje de montar `ngsw-worker.js`. Va ahí y
   * no en un spec a propósito: el fallo necesita un navegador real con dos SW
   * compitiendo, y jsdom no lo reproduce.
   *
   * `requestSubscription` devuelve la suscripción existente si ya la había con
   * la misma llave, así que llamarlo en cada visita al inbox es barato y
   * además repara una suscripción que el navegador hubiera descartado.
   */
  async registrarServiceWorkerYVapid(): Promise<void> {
    /* Falso en desarrollo (`enabled: !isDevMode()`) y en navegadores sin SW. */
    if (!this.swPush.isEnabled) return;

    try {
      const resKey = await this.api.get<{ publicKey: string }>('push/public-key');
      if (!resKey?.publicKey) return;

      const sub = await this.swPush.requestSubscription({ serverPublicKey: resKey.publicKey });

      const subJson = sub.toJSON();
      const keys = subJson.keys as Record<string, string> | undefined;
      const p256dh = keys?.['p256dh'];
      const auth = keys?.['auth'];
      if (subJson.endpoint && p256dh && auth) {
        await this.api.post('push/suscribir', {
          endpoint: subJson.endpoint,
          keys: { p256dh, auth },
        });
      }
    } catch {
      // Permiso denegado, modo privado, o el SW todavía no está listo.
    }
  }

  /**
   * Baja de ESTE dispositivo: deja de recibir push para esta suscripción.
   *
   * Tres pasos y ninguno decide nada de sesión —pedir la suscripción actual,
   * decirle al servidor que la borre, cancelarla en el navegador—. Quién es la
   * usuaria y cuándo toca salir es asunto de `AuthService`, que llama a esto.
   *
   * **Best-effort de arriba abajo.** Ningún fallo puede impedir cerrar sesión,
   * así que cada paso se intenta por separado y ninguno propaga. Los fallos no
   * se registran en consola a propósito: el código de la app no tiene una sola
   * llamada a `console` —el build la rechaza— y además el endpoint identifica
   * el dispositivo, así que dejarlo escrito en las devtools de una tablet
   * compartida sería filtrar justo lo que esto viene a cerrar.
   *
   * Si la baja en el servidor falla, la fila queda huérfana: la reasigna sola
   * el upsert por `endpoint` en cuanto otra agente se suscriba desde aquí.
   */
  darDeBaja(): void {
    if (!this.swPush.isEnabled) return;

    /* La petición se dispara AQUÍ, en el prólogo síncrono y sin un solo `await`
       por delante. No es estilo: `firstValueFrom` suscribe de inmediato, así que
       el interceptor lee el token en este mismo tick — y quien llama lo borra en
       la línea siguiente. Preguntarle antes al navegador por la suscripción
       (`swPush.subscription` es asíncrono) mandaría la baja un tick más tarde,
       ya sin credencial, y el servidor respondería 401. Por eso el endpoint se
       recuerda en cuanto se conoce. */
    const endpoint = this.endpointSuscrito;
    if (endpoint) {
      void this.api.delete('push/desuscribir', { endpoint }).catch(() => undefined);
    }
    this.endpointSuscrito = null;

    /* Cancelar en el navegador no necesita credencial, así que puede tomarse su
       tiempo. Si falla, el servidor ya no tiene la fila: no llegará nada. */
    void this.cancelarEnNavegador();
  }

  private async cancelarEnNavegador(): Promise<void> {
    try {
      const suscripcion = await firstValueFrom(this.swPush.subscription.pipe(take(1)));
      await suscripcion?.unsubscribe();
    } catch {
      // El navegador pudo haberla descartado ya, o no haberla tenido nunca.
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
