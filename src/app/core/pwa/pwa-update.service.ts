import { DestroyRef, Injectable, inject } from '@angular/core';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { filter } from 'rxjs/operators';

import { ToastService } from '../toast/toast.service';

/** Intervalo para buscar actualizaciones automáticamente (30 minutos) */
const INTERVALO_CHEQUEO_MS = 30 * 60 * 1000;

/** Si el usuario descarta o ignora el aviso, volver a avisar en 1 hora */
const INTERVALO_RENOTIFICACION_MS = 60 * 60 * 1000;

@Injectable({
  providedIn: 'root',
})
export class PwaUpdateService {
  private readonly swUpdate = inject(SwUpdate);
  private readonly toastService = inject(ToastService);

  private actualizacionPendiente = false;
  private timerRenotificacion?: ReturnType<typeof setTimeout>;

  inicializar(destroyRef: DestroyRef): void {
    if (!this.swUpdate.isEnabled) {
      return;
    }

    /* 1. Escucha eventos VERSION_READY cuando hay nueva versión del SW cargada */
    this.swUpdate.versionUpdates
      .pipe(filter((evt): evt is VersionReadyEvent => evt.type === 'VERSION_READY'))
      .subscribe(() => {
        this.actualizacionPendiente = true;
        this.notificarActualizacionDisponible();
      });

    /* 2. Chequeo periódico cada 30 minutos */
    const timerChequeo = setInterval(() => {
      this.swUpdate.checkForUpdate().catch(() => {});
    }, INTERVALO_CHEQUEO_MS);

    destroyRef.onDestroy(() => {
      clearInterval(timerChequeo);
      if (this.timerRenotificacion) {
        clearTimeout(this.timerRenotificacion);
      }
    });

    /* Chequeo inicial voluntario */
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
      if (this.actualizacionPendiente) {
        this.notificarActualizacionDisponible();
      }
    }, INTERVALO_RENOTIFICACION_MS);
  }

  /** Aplica la actualización y recarga la aplicación */
  async aplicarActualizacion(): Promise<void> {
    try {
      await this.swUpdate.activateUpdate();
    } catch {
      // Ignorar error si ya estaba activo
    } finally {
      window.location.reload();
    }
  }
}
