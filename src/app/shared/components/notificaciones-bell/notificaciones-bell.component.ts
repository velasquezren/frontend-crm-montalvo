import { DatePipe } from '@angular/common';
import { httpResource } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  HostListener,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';

import { AuthService } from '../../../core/auth/auth.service';
import { paginaVacia, RespuestaPaginada } from '../../../core/api/pagination.model';
import { RealtimeService } from '../../../core/realtime/realtime.service';
import { ToastService } from '../../../core/toast/toast.service';
import {
  Actividad,
  esActividadVencida,
  ESTADO_ACTIVIDAD_LABEL,
  ResumenActividades,
  TIPO_ACTIVIDAD_ICONO,
  TIPO_ACTIVIDAD_LABEL,
} from '../../../features/actividades/actividad.model';
import { ActividadesService } from '../../../features/actividades/actividades.service';
import { ButtonComponent } from '../button/button.component';
import { IconComponent } from '../icon/icon.component';

/** `HH:mm` del final del día de hoy, en ISO — "vencidas + hoy" en una sola consulta. */
function finDeHoyIso(): string {
  const fin = new Date();
  fin.setHours(23, 59, 59, 999);
  return fin.toISOString();
}

/**
 * Campana de notificaciones del topbar — igual patrón que Salesforce/HubSpot/
 * Pipedrive (investigado antes de construir esta, no copiado a ciegas):
 * icono con contador + panel desplegable + tiempo real, no solo un correo o
 * un push que se pierde si la pestaña está cerrada.
 *
 * Vive en `shared/components` (no en `features/actividades`) porque el
 * layout la monta una vez para toda la sesión, sin importar en qué página
 * esté la agente — un recordatorio tiene que poder avisar aunque esté viendo
 * Conversaciones o Ventas, no solo dentro de /actividades.
 */
@Component({
  selector: 'app-notificaciones-bell',
  imports: [ButtonComponent, DatePipe, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './notificaciones-bell.component.html',
  styleUrl: './notificaciones-bell.component.css',
})
export class NotificacionesBellComponent {
  private readonly actividadesService = inject(ActividadesService);
  private readonly authService = inject(AuthService);
  private readonly realtimeService = inject(RealtimeService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly elementRef = inject(ElementRef);

  protected readonly tipoIcono = TIPO_ACTIVIDAD_ICONO;
  protected readonly tipoLabel = TIPO_ACTIVIDAD_LABEL;
  protected readonly estadoLabel = ESTADO_ACTIVIDAD_LABEL;
  protected readonly esVencida = esActividadVencida;

  protected readonly abierto = signal(false);

  /**
   * Conteo del badge: se pide siempre (no solo con el panel abierto) — es lo
   * único visible sin abrir nada, así que tiene que estar ya listo la
   * primera vez que la agente mira hacia la campana.
   */
  protected readonly resumen = httpResource<ResumenActividades>(
    () => this.actividadesService.resumenRequest(),
    { defaultValue: { vencidas: 0, hoy: 0, proximaSemana: 0 } },
  );

  protected readonly totalUrgentes = computed(() => this.resumen.value().vencidas + this.resumen.value().hoy);
  protected readonly hayVencidas = computed(() => this.resumen.value().vencidas > 0);

  /**
   * Lista del panel: solo se pide mientras está abierto — nadie la mira
   * cerrada, así que no vale la pena pagar la petición por adelantado.
   */
  protected readonly items = httpResource<RespuestaPaginada<Actividad>>(
    () =>
      this.abierto()
        ? this.actividadesService.listarRequest({ estado: 'PENDIENTE', hasta: finDeHoyIso(), pagina: 1, limite: 8 })
        : undefined,
    { defaultValue: paginaVacia<Actividad>() },
  );

  constructor() {
    // El layout es el único punto de la app que garantiza estar montado toda
    // la sesión — por eso el socket compartido se conecta AQUÍ, no en
    // Conversaciones, aunque Conversaciones también lo use. `RealtimeService`
    // ya está pensado para múltiples suscriptores (refCount).
    this.realtimeService.conectar(inject(DestroyRef));

    // Respaldo de 60s, igual criterio que el inbox de Conversaciones: el
    // socket es la vía principal, esto es solo la red por si se cae.
    const intervalo = setInterval(() => this.resumen.reload(), 60_000);
    inject(DestroyRef).onDestroy(() => clearInterval(intervalo));

    effect(() => {
      const aviso = this.realtimeService.recordatorioActividad();
      if (!aviso) return;

      // Sin datos de paciente en el socket — se descarta sin pedir nada si
      // el recordatorio no es de quien está mirando (ver la nota del gateway).
      if (aviso.agenteId !== this.authService.user()?.id) return;

      this.resumen.reload();
      if (this.abierto()) this.items.reload();

      void this.actividadesService
        .obtener(aviso.actividadId)
        .then(actividad => this.notificarEnPantalla(actividad))
        .catch(() => undefined); // ya cambió de estado entre el aviso y el fetch — no hay nada que mostrar
    });
  }

  private notificarEnPantalla(actividad: Actividad): void {
    this.toast.show(
      `${actividad.titulo} — ${actividad.cliente.nombre}`,
      'info',
      'Recordatorio',
      10_000,
      'Completar',
      () => void this.completar(actividad),
    );
  }

  protected toggle(): void {
    this.abierto.update(v => !v);
  }

  protected cerrar(): void {
    this.abierto.set(false);
  }

  @HostListener('document:click', ['$event'])
  protected onDocumentClick(event: MouseEvent): void {
    if (!this.abierto()) return;
    if (!this.elementRef.nativeElement.contains(event.target)) {
      this.abierto.set(false);
    }
  }

  protected irAActividades(): void {
    this.cerrar();
    void this.router.navigate(['/actividades']);
  }

  protected async completar(actividad: Actividad): Promise<void> {
    try {
      await this.actividadesService.actualizarEstado(actividad.id, 'COMPLETADA');
      this.toast.show('Marcada como completada.', 'success');
      this.items.reload();
      this.resumen.reload();
    } catch {
      this.toast.show('No se pudo completar la actividad.', 'error');
    }
  }
}
