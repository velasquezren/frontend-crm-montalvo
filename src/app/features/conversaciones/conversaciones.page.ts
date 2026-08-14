import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  OnDestroy,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';

import { RealtimeService } from '../../core/realtime/realtime.service';
import { ModoInmersivoService } from '../../core/ui/modo-inmersivo.service';
import { NotificacionNativaService } from '../../core/notification/notificacion-nativa.service';
import { ConversacionesService } from './conversaciones.service';
import { ConversacionesStateService } from './services/conversaciones-state.service';
import { ConversacionListaComponent } from './components/conversacion-lista/conversacion-lista.component';
import { ConversacionThreadComponent } from './components/conversacion-thread/conversacion-thread.component';
import { ConversacionComposerComponent } from './components/conversacion-composer/conversacion-composer.component';
import { ConversacionSidebarComponent } from './components/conversacion-sidebar/conversacion-sidebar.component';

/**
 * Conversaciones — WhatsApp Inbox Premium.
 *
 * Componente orquestador que gestiona:
 * - Sincronización bidireccional de ruta (?id=...)
 * - Tiempo real vía WebSockets (RealtimeService)
 * - Polling de respaldo (60s)
 * - Modo inmersivo en dispositivos móviles
 * - Notificaciones nativas y badges PWA
 */
@Component({
  selector: 'app-conversaciones',
  standalone: true,
  imports: [
    ConversacionListaComponent,
    ConversacionThreadComponent,
    ConversacionComposerComponent,
    ConversacionSidebarComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.chat-inmersivo]': 'state.seleccionadaId()' },
  templateUrl: './conversaciones.page.html',
  styleUrl: './conversaciones.page.css',
})
export class ConversacionesPage implements AfterViewInit, OnDestroy {
  protected readonly state = inject(ConversacionesStateService);
  private readonly conversacionesService = inject(ConversacionesService);
  private readonly realtimeService = inject(RealtimeService);
  private readonly modoInmersivo = inject(ModoInmersivoService);
  private readonly notificacionNativa = inject(NotificacionNativaService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  private pollingInterval: ReturnType<typeof setInterval> | null = null;
  private entradaPropia = false;

  /** Chat abierto según la URL. */
  private readonly idEnRuta = toSignal(
    this.route.queryParamMap.pipe(map(p => p.get('id'))),
    { initialValue: null },
  );

  /** Búsqueda o teléfono pasado por URL desde otros módulos. */
  private readonly busquedaEnRuta = toSignal(
    this.route.queryParamMap.pipe(map(p => p.get('busqueda') || p.get('telefono'))),
    { initialValue: null },
  );

  constructor() {
    void this.notificacionNativa.solicitarPermiso();

    /* Actualizar badge de la PWA según chats sin responder */
    effect(() => {
      const sinResponder = this.state.stats().sinResponder;
      this.notificacionNativa.actualizarBadge(sinResponder);
    });

    /* Recibir mensajes entrantes y actualizaciones realtime por WebSocket */
    let timerReload: ReturnType<typeof setTimeout> | null = null;
    effect(() => {
      const aviso = this.realtimeService.actividad();
      if (!aviso) return;

      if (timerReload) clearTimeout(timerReload);
      timerReload = setTimeout(() => {
        this.state.conversacionesRecurso.reload();
        void this.conversacionesService.actualizarCachePorRealtime(aviso.conversacionId);

        const chatSeleccionado = this.state.seleccionadaId() === aviso.conversacionId;

        if (chatSeleccionado) {
          this.state.detalle.reload();
          void this.conversacionesService.marcarLeido(aviso.conversacionId, false).catch(() => {});
        }

        if (document.hidden || !chatSeleccionado) {
          this.notificacionNativa.mostrar({
            titulo: 'Nuevo mensaje en WhatsApp',
            mensaje: 'Tienes un nuevo mensaje entrante en Montalvo CRM.',
            tag: `conv-${aviso.conversacionId}`,
            alHacerClic: () => this.state.seleccionar(aviso.conversacionId),
          });
        }
      }, 100);
    });

    /* Reconexión del WebSocket */
    effect(() => {
      const n = this.realtimeService.reconectado();
      if (n === 0) return;

      this.state.conversacionesRecurso.reload();
      if (this.state.seleccionadaId()) {
        this.state.detalle.reload();
      }
    });

    /* Sincronización con la ruta (?id=...) */
    effect(() => {
      const id = this.idEnRuta();
      if (id === this.state.seleccionadaId()) return;

      if (id) {
        this.state.seleccionadaId.set(id);
        this.state.editandoFicha.set(false);
        if (!this.state.pantallaAncha()) this.state.panelAbierto.set(false);
        void this.conversacionesService.marcarLeido(id, false).catch(() => {});
      } else {
        this.state.seleccionadaId.set(null);
        this.state.editandoFicha.set(false);
        this.entradaPropia = false;
      }
    });

    /* Búsqueda o teléfono pasado por queryParams (desde Clientes o Leads) */
    effect(() => {
      const q = this.busquedaEnRuta();
      if (!q) return;

      this.state.busqueda.set(q);

      const chats = this.state.conversacionesRecurso.value();
      if (chats.length > 0) {
        const queryNorm = q.trim().toLowerCase();
        const coincidencia = chats.find(
          c => c.cliente.telefono.includes(queryNorm) || c.cliente.nombre.toLowerCase().includes(queryNorm),
        );
        if (coincidencia && this.state.seleccionadaId() !== coincidencia.id) {
          this.state.seleccionar(coincidencia.id);
        }
      }
    });

    /* Modo inmersivo en móvil cuando hay chat abierto */
    effect(() => {
      if (this.state.seleccionadaId()) {
        this.modoInmersivo.activar();
      } else {
        this.modoInmersivo.desactivar();
      }
    });
  }

  ngAfterViewInit(): void {
    this.startPolling();
  }

  ngOnDestroy(): void {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
    }
  }

  private startPolling(): void {
    this.pollingInterval = setInterval(() => {
      this.state.conversacionesRecurso.reload();
      if (this.state.seleccionadaId()) {
        this.state.detalle.reload();
      }
    }, 60000);
  }
}
