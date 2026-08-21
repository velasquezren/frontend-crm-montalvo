import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  OnDestroy,
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';
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
/** Latido del respaldo. Un minuto es lo que el navegador respeta de fondo. */
const INTERVALO_RESPALDO_MS = 60_000;

/** Con el socket sano solo se pregunta cada 5 latidos, por si quedó zombi. */
const TICKS_CON_SOCKET = 5;

/**
 * Si este latido del respaldo debe preguntar al servidor.
 *
 * Se saca del componente para poder fijarla con pruebas: es la regla que decide
 * cuánta red gasta la vista más usada del CRM, y de la que salían 219 de 437
 * peticiones que no traían nada nuevo.
 *
 * - Pestaña oculta: nunca. Nadie está mirando, y al volver se refresca una vez.
 * - Socket conectado: uno de cada `TICKS_CON_SOCKET`, solo por si quedó zombi.
 * - Socket caído: cada latido, que es justo cuando el respaldo hace falta.
 */
export function debeRefrescar(ticks: number, conectado: boolean, oculto: boolean): boolean {
  if (oculto) return false;
  return ticks >= (conectado ? TICKS_CON_SOCKET : 1);
}

@Component({
  selector: 'app-conversaciones',
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
  private readonly route = inject(ActivatedRoute);

  private pollingInterval: ReturnType<typeof setInterval> | null = null;
  private alVolverAlFrente: (() => void) | null = null;
  private ticksDesdeUltimoRefresco = 0;

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
    if (this.alVolverAlFrente) {
      document.removeEventListener('visibilitychange', this.alVolverAlFrente);
    }
  }

  /**
   * Respaldo por temporizador — y respaldo de verdad, no un segundo canal.
   *
   * El socket es quien avisa de la actividad; esto solo existe por si se cae sin
   * que `reconectado` llegue a dispararse. Estaba escrito como si fuera el canal
   * principal: recargaba el inbox Y el chat abierto cada 60 s pasara lo que
   * pasara, con el socket sano y con la pestaña de fondo.
   *
   * Medido en el log de producción: de 437 peticiones a `/conversaciones`, **219
   * devolvieron 304** — la mitad eran viajes de red que no traían nada nuevo.
   *
   * Ahora el ritmo depende de lo que esté pasando:
   *   · pestaña oculta      → no se pregunta (nadie está mirando)
   *   · socket conectado    → cada 5 min, solo por si la conexión quedó zombi
   *   · socket caído        → cada 60 s, que es cuando el respaldo hace falta
   *
   * Al volver a la pestaña se recarga una vez, que sustituye con creces a todo
   * lo que se habría preguntado mientras no se veía.
   */
  private startPolling(): void {
    this.pollingInterval = setInterval(() => {
      this.ticksDesdeUltimoRefresco++;
      if (!debeRefrescar(this.ticksDesdeUltimoRefresco, this.realtimeService.conectado(), document.hidden)) {
        return;
      }

      this.ticksDesdeUltimoRefresco = 0;
      this.refrescar();
    }, INTERVALO_RESPALDO_MS);

    /* Volver a la pestaña es la señal más fuerte de que alguien quiere ver algo
       al día: se refresca una vez y se reinicia la cuenta. */
    this.alVolverAlFrente = () => {
      if (document.hidden) return;
      this.ticksDesdeUltimoRefresco = 0;
      this.refrescar();
    };
    document.addEventListener('visibilitychange', this.alVolverAlFrente);
  }

  private refrescar(): void {
    this.state.conversacionesRecurso.reload();
    if (this.state.seleccionadaId()) {
      this.state.detalle.reload();
    }
  }
}
