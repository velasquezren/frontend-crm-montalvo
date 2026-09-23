import { ErrorCargaComponent } from '../../shared/components/error-carga/error-carga.component';
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  OnDestroy,
  untracked,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';

import { RealtimeService } from '../../core/realtime/realtime.service';
import { ModoInmersivoService } from '../../core/ui/modo-inmersivo.service';
import { NotificacionNativaService } from '../../core/notification/notificacion-nativa.service';
import { ConversacionesService } from './conversaciones.service';
import { esFiltroInbox } from './conversacion.model';
import { resolverChatDePaciente } from './enlace-chat';
import { ToastService } from '../../core/toast/toast.service';
import { mensajeDeError } from '../../core/api/http-error';
import { textoVistaPrevia } from './vista-previa';
import { nombreParaMostrar } from '../../shared/models/nombre-cliente';
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
    ErrorCargaComponent,
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
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  private pollingInterval: ReturnType<typeof setInterval> | null = null;
  private alVolverAlFrente: (() => void) | null = null;
  private ticksDesdeUltimoRefresco = 0;

  /** Chat abierto según la URL. */
  private readonly idEnRuta = toSignal(
    this.route.queryParamMap.pipe(map(p => p.get('id'))),
    { initialValue: null },
  );

  /** Texto de búsqueda pasado por URL: solo filtra la bandeja, no abre nada. */
  private readonly busquedaEnRuta = toSignal(
    this.route.queryParamMap.pipe(map(p => p.get('busqueda'))),
    { initialValue: null },
  );

  /** «Llévame al chat de esta paciente» desde Clientes, Leads o Actividades (ver `enlaceAlChat`). */
  private readonly telefonoEnRuta = toSignal(
    this.route.queryParamMap.pipe(map(p => p.get('telefono'))),
    { initialValue: null },
  );

  /** Pestaña pedida por URL: el dashboard enlaza a «Sin responder». */
  private readonly pestanaEnRuta = toSignal(
    this.route.queryParamMap.pipe(map(p => p.get('pestana'))),
    { initialValue: null },
  );

  constructor() {
    void this.notificacionNativa.solicitarPermiso();

    /* Sin filtros heredados de otra visita: el número que la agente pulsó en
       el dashboard se cuenta sin línea, agente ni «solo míos», y la pestaña
       tiene que mostrar esos mismos chats. */
    effect(() => {
      const pestana = this.pestanaEnRuta();
      if (!esFiltroInbox(pestana)) return;
      this.state.filtroTab.set(pestana);
      this.state.filtroLineaId.set(null);
      this.state.filtroAgenteId.set(null);
      this.state.soloMisChatsAdmin.set(false);
    });

    /* Actualizar badge de la PWA según chats sin responder */
    effect(() => {
      const sinResponder = this.state.stats().sinResponder;
      this.notificacionNativa.actualizarBadge(sinResponder);
    });

    /* Avisos del WebSocket. Se juntan 100 ms en un LOTE por conversación:
       antes el temporizador se reiniciaba con cada aviso y solo procesaba el
       último, así que si dos pacientes escribían casi a la vez la fila del
       primero no se actualizaba. `entrante` se acumula con OR: si en la ráfaga
       hubo un mensaje del paciente, se avisa aunque detrás viniera un tick. */
    const pendientes = new Map<string, boolean>();
    let temporizador: ReturnType<typeof setTimeout> | null = null;
    effect(() => {
      const aviso = this.realtimeService.actividad();
      if (!aviso) return;
      pendientes.set(aviso.conversacionId, (pendientes.get(aviso.conversacionId) ?? false) || aviso.entrante);
      if (temporizador) clearTimeout(temporizador);
      temporizador = setTimeout(() => {
        const lote = [...pendientes];
        pendientes.clear();
        for (const [conversacionId, entrante] of lote) void this.procesarAviso(conversacionId, entrante);
      }, 100);
    });

    /* Reconexión del WebSocket */
    effect(() => {
      const n = this.realtimeService.reconectado();
      if (n === 0) return;

      this.state.inbox.reload();
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

    /* Llegar desde la agenda busca en todas las líneas autorizadas. Los
       filtros de una visita anterior no deben ocultar el paciente solicitado. */
    effect(() => {
      const q = this.busquedaEnRuta();
      if (!q) return;
      this.state.busqueda.set(q);
      this.state.filtroLineaId.set(null);
      this.state.filtroTab.set('TODAS');
      this.state.filtroAgenteId.set(null);
      this.state.soloMisChatsAdmin.set(false);
    });

    effect(() => {
      const telefono = this.telefonoEnRuta();
      if (!telefono) return;
      untracked(() => void this.abrirChatDePaciente(telefono));
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

  /**
   * Un aviso del socket: refresca la fila (solo esa), el hilo si está abierto y,
   * si escribió el paciente, avisa.
   *
   * Solo `entrante` suena y notifica. Los demás avisos son ticks de entrega,
   * envíos propios o media que termina de subir: el backend ya separó eso en
   * el push, y aquí se había vuelto a mezclar — cada tick sonaba como un
   * mensaje nuevo. La etiqueta `chat-<id>` es la misma que usa el push, así que
   * el navegador reemplaza en vez de mostrar dos avisos del mismo mensaje.
   *
   * Leído solo con la pestaña a la vista: marcarlo con la pestaña oculta le
   * pone al paciente el doble tick azul de un mensaje que nadie leyó. Al
   * volver a la pestaña se marca (`alVolverAlFrente`).
   */
  private async procesarAviso(conversacionId: string, entrante: boolean): Promise<void> {
    const fila = await this.state.refrescarFilaPorRealtime(conversacionId);
    const abierta = this.state.seleccionadaId() === conversacionId;

    if (abierta) {
      this.state.detalle.reload();
      if (!document.hidden) void this.conversacionesService.marcarLeido(conversacionId, false).catch(() => {});
    }

    if (entrante && (document.hidden || !abierta)) {
      this.notificacionNativa.mostrar({
        titulo: fila ? `WhatsApp: ${nombreParaMostrar(fila.cliente)}` : 'Mensaje de WhatsApp',
        mensaje: (fila && textoVistaPrevia(fila.mensajes[0])) || 'Tienes un mensaje nuevo',
        tag: `chat-${conversacionId}`,
        alHacerClic: () => this.state.seleccionar(conversacionId),
      });
    }
  }

  /**
   * Resuelve UNA vez el enlace «chat de esta paciente» y lo retira de la URL.
   *
   * Antes el teléfono se quedaba en la URL y un efecto lo volvía a aplicar cada
   * vez que la bandeja cambiaba: si la agente abría otro chat, el siguiente
   * mensaje en tiempo real la devolvía al de la paciente del enlace. Y se
   * elegía por «contiene», así que podía abrir el chat de otra persona.
   *
   * Se pregunta al servidor en vez de mirar la bandeja cargada: el chat puede
   * ser antiguo o de otra línea que no está en pantalla.
   */
  private async abrirChatDePaciente(telefono: string): Promise<void> {
    this.state.filtroLineaId.set(null);
    this.state.filtroTab.set('TODAS');
    this.state.filtroAgenteId.set(null);
    this.state.soloMisChatsAdmin.set(false);
    try {
      const pagina = await this.conversacionesService.listarPagina(
        { lineaId: null, tab: 'TODAS', busqueda: telefono, agenteId: null, soloMios: false },
        1,
      );
      const chat = resolverChatDePaciente(pagina.datos, telefono);
      if (chat.tipo === 'UNO') {
        this.state.busqueda.set('');
        void this.router.navigate([], { queryParams: { id: chat.id, telefono: null }, queryParamsHandling: 'merge', replaceUrl: true });
        return;
      }
      void this.router.navigate([], { queryParams: { telefono: null }, queryParamsHandling: 'merge', replaceUrl: true });
      if (chat.tipo === 'VARIOS') {
        this.state.busqueda.set(telefono);
        this.toast.info('Tiene chats en varias líneas: elige cuál abrir.');
      } else {
        /* Sin chat todavía (o de una línea a la que no tienes acceso): se
           ofrece escribirle, con el número ya puesto. */
        this.state.nuevoChatPara.set(telefono);
      }
    } catch (err) {
      this.state.busqueda.set(telefono);
      void this.router.navigate([], { queryParams: { telefono: null }, queryParamsHandling: 'merge', replaceUrl: true });
      this.toast.error(mensajeDeError(err, 'No se pudo buscar el chat de la paciente.'));
    }
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
      /* Lo que llegó al chat abierto con la pestaña oculta se marca leído
         ahora, que es cuando de verdad se ve. */
      const abierta = this.state.seleccionadaId();
      if (abierta) void this.conversacionesService.marcarLeido(abierta, false).catch(() => {});
    };
    document.addEventListener('visibilitychange', this.alVolverAlFrente);
  }

  private refrescar(): void {
    if (this.state.lineas.error()) this.state.lineas.reload();
    this.state.inbox.reload();
    if (this.state.seleccionadaId()) {
      this.state.detalle.reload();
    }
  }
}
