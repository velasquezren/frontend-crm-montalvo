import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { httpResource } from '@angular/common/http';

import { mensajeDeError } from '../../core/api/http-error';
import { paginaVacia, RespuestaPaginada } from '../../core/api/pagination.model';
import { NotificacionNativaService } from '../../core/notification/notificacion-nativa.service';
import { ToastService } from '../../core/toast/toast.service';
import { ButtonComponent } from '../../shared/components/button/button.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { ErrorCargaComponent } from '../../shared/components/error-carga/error-carga.component';
import { LoadingSkeletonComponent } from '../../shared/components/loading-skeleton/loading-skeleton.component';
import { PaginatorComponent } from '../../shared/components/paginator/paginator.component';
import { SwitchComponent } from '../../shared/components/switch/switch.component';
import { AvisoLinea } from './linea-whatsapp.model';
import { LineasWhatsappService } from './lineas-whatsapp.service';

/**
 * «¿Quiero que me suene esta línea?», decidido por cada persona para sí.
 *
 * Existe porque ver una línea y que te suene son cosas distintas: quien cubre
 * Recepción necesita ver esos chats, pero que le suene cada mensaje del pool es
 * cómo acaba desactivando las notificaciones del teléfono entero —y entonces
 * tampoco le suenan los suyos—. Vale para todos los roles, admins incluidos,
 * que ven todas las líneas por su rol.
 *
 * Lo que decide aquí lo lee el backend en cada mensaje; no hace falta volver a
 * entrar. Los chats asignados a ella le suenan aunque la línea esté apagada.
 */
@Component({
  selector: 'app-avisos-lineas',
  imports: [ButtonComponent, EmptyStateComponent, ErrorCargaComponent, LoadingSkeletonComponent, PaginatorComponent, SwitchComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="bg-white rounded-2xl border border-border p-6 shadow-subtle space-y-4" aria-labelledby="titulo-avisos">
      <div>
        <h3 id="titulo-avisos" class="text-xs font-bold text-text-muted uppercase tracking-wider">Avisos de mensajes nuevos</h3>
        <p class="mt-1.5 text-sm text-text-muted">
          Elige qué líneas te avisan. Apagada, sigues viendo sus chats, pero no te suenan en
          el teléfono ni en la pestaña. Los chats que tengas asignados te avisan igual.
        </p>
      </div>

      <!-- El interruptor de la línea no sirve si el navegador tiene bloqueadas
           las notificaciones: se dice aquí y no se deja adivinar. -->
      @if (notificaciones.permiso() === 'default') {
        <div class="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-bg-light px-3 py-2.5">
          <p class="text-sm text-text-dark">Este dispositivo todavía no tiene las notificaciones activadas.</p>
          <app-button size="sm" variant="secondary" icon="bell" (clicked)="activarEnEsteDispositivo()">Activar</app-button>
        </div>
      } @else if (notificaciones.permiso() === 'denied') {
        <p class="rounded-xl bg-bg-light px-3 py-2.5 text-sm text-text-dark">
          Este navegador tiene las notificaciones bloqueadas. Actívalas en los ajustes del sitio
          para que te lleguen los avisos.
        </p>
      }

      @if (avisos.isLoading()) {
        <app-loading-skeleton shape="text" height="2.75rem" />
        <app-loading-skeleton shape="text" height="2.75rem" />
      } @else if (avisos.error()) {
        <app-error-carga que="tus líneas" (reintentar)="avisos.reload()" />
      } @else if (avisos.value().datos.length > 0) {
        <ul class="rounded-xl border border-border divide-y divide-border">
          @for (aviso of avisos.value().datos; track aviso.lineaId) {
            <li class="flex items-center justify-between gap-3 px-3 py-2.5">
              <div class="min-w-0">
                <p class="text-sm font-medium text-text-dark truncate">{{ aviso.nombre }}</p>
                @if (aviso.telefono) { <p class="text-xs text-text-muted tabular-nums">{{ aviso.telefono }}</p> }
              </div>
              <app-switch
                [value]="aviso.suena"
                [disabled]="enVuelo().includes(aviso.lineaId)"
                (valueChange)="alternar(aviso.lineaId, $event)"
                [ariaLabel]="'Avisos de ' + aviso.nombre" />
            </li>
          }
        </ul>
        <app-paginator
          [pagina]="avisos.value().pagina"
          [totalPaginas]="avisos.value().totalPaginas"
          [total]="avisos.value().total"
          [limite]="avisos.value().limite"
          (cambiar)="pagina.set($event)" />
      } @else {
        <app-empty-state
          icon="message-circle"
          title="No atiendes ninguna línea de WhatsApp"
          description="Cuando te asignen una, aparecerá aquí para que elijas si te avisa." />
      }
    </section>
  `,
})
export class AvisosLineasComponent {
  private readonly lineasService = inject(LineasWhatsappService);
  private readonly toast = inject(ToastService);
  protected readonly notificaciones = inject(NotificacionNativaService);

  protected readonly pagina = signal(1);
  protected readonly avisos = httpResource<RespuestaPaginada<AvisoLinea>>(
    () => this.lineasService.avisosRequest(this.pagina()),
    { defaultValue: paginaVacia<AvisoLinea>() },
  );
  /** Líneas con un cambio sin confirmar: su interruptor espera. */
  protected readonly enVuelo = signal<string[]>([]);

  /**
   * Optimista: el resultado es predecible y el backend solo lo rechaza si la
   * línea dejó de ser suya. Si falla se revierte ESA línea —no la lista
   * entera, que pisaría otro interruptor tocado mientras tanto—, y mientras
   * tanto su interruptor espera: dos toques rápidos podrían llegar al servidor
   * en otro orden y dejar guardado lo contrario de lo que se ve.
   */
  protected async alternar(lineaId: string, suena: boolean): Promise<void> {
    this.fijarLocal(lineaId, suena);
    this.enVuelo.update(ids => [...ids, lineaId]);
    try {
      await this.lineasService.fijarAviso(lineaId, suena);
    } catch (err) {
      this.fijarLocal(lineaId, !suena);
      this.toast.error(mensajeDeError(err, 'No se pudo cambiar el aviso de esa línea.'), 'Error');
    } finally {
      this.enVuelo.update(ids => ids.filter(id => id !== lineaId));
    }
  }

  protected async activarEnEsteDispositivo(): Promise<void> {
    if (!(await this.notificaciones.solicitarPermiso()) && this.notificaciones.permiso() !== 'granted') {
      this.toast.info('Sin permiso del navegador no pueden llegar avisos a este dispositivo.', 'Notificaciones');
    }
  }

  private fijarLocal(lineaId: string, suena: boolean): void {
    this.avisos.update(pagina => ({
      ...pagina,
      datos: pagina.datos.map(a => (a.lineaId === lineaId ? { ...a, suena } : a)),
    }));
  }
}
