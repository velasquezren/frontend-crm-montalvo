import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { filter } from 'rxjs/operators';

import { APP_BUILD } from '../build/app-build';
import { ToastService } from '../toast/toast.service';

/** Intervalo para buscar actualizaciones automáticamente (30 minutos) */
const INTERVALO_CHEQUEO_MS = 30 * 60 * 1000;

/** Si el usuario descarta o ignora el aviso, volver a avisar en 1 hora */
const INTERVALO_RENOTIFICACION_MS = 60 * 60 * 1000;

/**
 * Ventana mínima entre dos chequeos EFECTIVOS, venga el disparo de donde venga.
 *
 * Volver a la pestaña dispara `focus` y `visibilitychange` casi a la vez, y si
 * además vencía el timer tendríamos tres descargas de `ngsw.json` por un solo
 * gesto. Cinco minutos es corto comparado con el problema que resuelve —media
 * hora de ceguera— y largo comparado con el ruido que evita.
 */
const THROTTLE_CHEQUEO_MS = 5 * 60 * 1000;

@Injectable({
  providedIn: 'root',
})
export class PwaUpdateService {
  private readonly swUpdate = inject(SwUpdate);
  private readonly toastService = inject(ToastService);

  private readonly pendiente = signal(false);

  /**
   * Hay una versión descargada esperando a que la app recargue.
   *
   * Es señal y es pública porque el toast no basta: se puede cerrar, y entre
   * una tormenta de avisos —la del bucle 401 del 2026-09-17, por ejemplo— se
   * pierde de vista. La cabecera la lee para dejar un rastro permanente.
   */
  readonly actualizacionPendiente = this.pendiente.asReadonly();

  /** Marca del último chequeo EFECTIVO. Vive aquí, y solo aquí: repartir
   *  temporizadores por componentes es como se acaba con tres relojes que no
   *  se conocen entre sí. */
  private ultimoChequeo = 0;
  private timerRenotificacion?: ReturnType<typeof setTimeout>;

  inicializar(destroyRef: DestroyRef): void {
    this.sellarBuild();

    if (!this.swUpdate.isEnabled) {
      return;
    }

    /* 1. Escucha eventos VERSION_READY cuando hay nueva versión del SW cargada */
    this.swUpdate.versionUpdates
      .pipe(filter((evt): evt is VersionReadyEvent => evt.type === 'VERSION_READY'))
      .subscribe(() => {
        this.pendiente.set(true);
        this.notificarActualizacionDisponible();
      });

    /* 2. Chequeo periódico cada 30 minutos */
    const timerChequeo = setInterval(() => this.chequear(), INTERVALO_CHEQUEO_MS);

    /* 3. Y, sobre todo, al volver a la app.
     *
     * El timer solo no alcanza: una agente puede pasar media hora en otra
     * pestaña y volver justo a un CRM desactualizado. `focus` y
     * `visibilitychange` cubren los dos gestos con los que se vuelve —cambiar
     * de pestaña y volver a la ventana—; el throttle se encarga de que los dos
     * juntos no cuenten dos veces. */
    const alVolver = (): void => this.chequear();
    const alCambiarVisibilidad = (): void => {
      if (document.visibilityState === 'visible') this.chequear();
    };
    window.addEventListener('focus', alVolver);
    document.addEventListener('visibilitychange', alCambiarVisibilidad);

    destroyRef.onDestroy(() => {
      clearInterval(timerChequeo);
      window.removeEventListener('focus', alVolver);
      document.removeEventListener('visibilitychange', alCambiarVisibilidad);
      if (this.timerRenotificacion) {
        clearTimeout(this.timerRenotificacion);
      }
    });

    /* Chequeo inicial voluntario */
    this.chequear();
  }

  /**
   * Único camino hacia `checkForUpdate()`.
   *
   * Todo disparo pasa por aquí —arranque, timer, foco, visibilidad— para que
   * la ventana de throttle sea una de verdad y no una por cada origen.
   */
  private chequear(): void {
    if (!this.swUpdate.isEnabled) return;

    const ahora = Date.now();
    if (ahora - this.ultimoChequeo < THROTTLE_CHEQUEO_MS) return;

    this.ultimoChequeo = ahora;
    void this.swUpdate.checkForUpdate().catch(() => {});
  }

  /** Muestra la notificación no intrusiva con el botón de actualización */
  notificarActualizacionDisponible(): void {
    this.toastService.show(
      'Hay una nueva versión del CRM lista para instalar.',
      'info',
      'Nueva versión disponible',
      0, // Permanece visible hasta interactuar
      'Actualizar ahora',
      () => this.aplicarActualizacion(),
    );

    /* 3. Si el usuario cierra el toast o ignora sin actualizar, se re-notifica en 1 hora */
    if (this.timerRenotificacion) {
      clearTimeout(this.timerRenotificacion);
    }
    this.timerRenotificacion = setTimeout(() => {
      if (this.pendiente()) {
        this.notificarActualizacionDisponible();
      }
    }, INTERVALO_RENOTIFICACION_MS);
  }

  /**
   * Aplica la actualización y recarga la aplicación.
   *
   * El `reload()` no es opcional ni es por comodidad: Angular advierte que
   * activar en caliente puede romper la app viva, porque el shell antiguo
   * seguirá pidiendo chunks lazy que ya no existen en la versión nueva. Aquí
   * eso no es teórico —Conversaciones entera es un chunk aparte—, así que
   * `activateUpdate()` y recarga van siempre juntos.
   */
  async aplicarActualizacion(): Promise<void> {
    try {
      await this.swUpdate.activateUpdate();
    } catch {
      // Ignorar error si ya estaba activo
    } finally {
      window.location.reload();
    }
  }

  /**
   * Deja por escrito qué build está corriendo este navegador.
   *
   * Es el único `console.*` del proyecto y está aquí a propósito: sin él, la
   * única forma de saber si un equipo ya tiene el código nuevo es deducirlo por
   * el bug que todavía tiene. `window.crmBuild` es el mismo dato a mano desde
   * DevTools, para mirar la PC de una agente y responder sin inferir nada.
   */
  private sellarBuild(): void {
    window.crmBuild = APP_BUILD;
    console.info(`CRM Montalvo · build ${APP_BUILD.sha} · ${APP_BUILD.compiladoEn}`);
  }
}
