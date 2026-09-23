import { CajaImagenPipe } from '../../caja-imagen';
import {
  ChangeDetectionStrategy,
  Component,
  effect,
  ElementRef,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { DatePipe } from '@angular/common';

import { CampanaOrigen, campanaOrigenDe } from '../../../../shared/models/campana-origen';
import { enlaceWhatsApp } from '../../../../shared/models/telefono';
import { AvatarComponent } from '../../../../shared/components/avatar/avatar.component';
import { BadgeComponent } from '../../../../shared/components/badge/badge.component';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { EmptyStateComponent } from '../../../../shared/components/empty-state/empty-state.component';
import { IconComponent } from '../../../../shared/components/icon/icon.component';
import { LoadingSkeletonComponent } from '../../../../shared/components/loading-skeleton/loading-skeleton.component';
import { ImageViewerComponent } from '../../../../shared/components/image-viewer/image-viewer.component';
import { WhatsAppMarkdownPipe } from '../../../../shared/pipes/whatsapp-markdown.pipe';
import { ToastService } from '../../../../core/toast/toast.service';
import { generarIniciales } from '../../../../core/auth/user.model';
import { envioSeReintentaSinRiesgo } from '../../clasificar-error-envio';
import { explicacionErrorWhatsapp } from '../../error-whatsapp';
import { ConversacionesService } from '../../conversaciones.service';
import { ConversacionesStateService } from '../../services/conversaciones-state.service';
import { ConversacionResumen, MensajeApi } from '../../conversacion.model';
import { textoExtra } from '../../../../core/api/datos-extra';
import { InicialesClientePipe, NombreClientePipe } from '../../../../shared/pipes/nombre-cliente.pipe';


/**
 * Panel central del chat: cabecera del paciente, aviso clínico fijado,
 * lista de mensajes agrupados por fecha con reproductor de audio,
 * previsualizador de medios y visor de imágenes (Lightbox).
 */
@Component({
  selector: 'app-conversacion-thread',
  imports: [
    CajaImagenPipe,
    InicialesClientePipe,
    NombreClientePipe,
    AvatarComponent,
    BadgeComponent,
    ButtonComponent,
    DatePipe,
    EmptyStateComponent,
    IconComponent,
    ImageViewerComponent,
    LoadingSkeletonComponent,
    WhatsAppMarkdownPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './conversacion-thread.component.html',
  styleUrl: './conversacion-thread.component.css',
})
export class ConversacionThreadComponent {
  protected readonly errorWhatsapp = explicacionErrorWhatsapp;
  protected readonly state = inject(ConversacionesStateService);
  private readonly conversacionesService = inject(ConversacionesService);
  private readonly toast = inject(ToastService);

  protected readonly iniciales = generarIniciales;

  /**
   * Las URLs de imagen que manda Meta en el `referral` caducan. Una miniatura
   * rota dejaría el icono de imagen partida dentro del panel, así que se oculta
   * el elemento y el resto del contexto —que es el que importa— se queda.
   */
  protected ocultarMiniatura(evento: Event): void {
    (evento.target as HTMLImageElement).style.display = 'none';
  }
  private readonly messagesContainer = viewChild<ElementRef<HTMLElement>>('messagesScroll');
  private readonly bottomAnchor = viewChild<ElementRef<HTMLElement>>('bottomAnchor');

  /* ── Estado Local de Scroll & Lightbox ─────────────────────────── */
  protected readonly lightboxUrl = signal<string | null>(null);

  /** Empieza plegado: en un móvil el hilo de mensajes vale más que el anuncio. */
  protected readonly campanaAbierta = signal(false);
  private scrollInicialListo = false;
  private chatActualId = '';

  /**
   * Si el usuario estaba pegado al fondo la última vez que scrolleó, ANTES
   * de que `items` cambiara. Lo actualiza `onMessagesScroll()` en cada
   * evento real de scroll — nunca este `effect()`, que solo lo LEE (con
   * `untracked`, para no crear una dependencia y volver a correr en cada
   * scroll suelto).
   *
   * Patrón estándar de cualquier chat (Slack, Discord, WhatsApp Web, y la
   * corrección de Chatwoot en su PR #10969 "Remove scroll to the bottom
   * when new message arrives"): el auto-scroll nunca pelea con quien ya
   * scrolleó hacia arriba a propósito. Antes de esto, este mismo `effect()`
   * forzaba el fondo en CUALQUIER cambio de `items` — abrir un chat nuevo,
   * que llegue un mensaje del paciente, o **cargar historial anterior**—,
   * así que scrollear arriba a leer una charla vieja se deshacía solo a los
   * pocos cientos de ms (el propio `setTimeout(forzarAbajo, 180)` de abajo),
   * peleando contra la compensación de `onMessagesScroll()`. Es exactamente
   * el tipo de fricción que hace preferir el WhatsApp del teléfono.
   */
  protected readonly pegadoAlFondo = signal(true);
  /** Mensajes que llegaron al final del hilo mientras se leía más arriba. */
  protected readonly nuevosSinVer = signal(0);
  private ultimoMensajeId: string | null = null;
  private static readonly UMBRAL_FONDO_PX = 120;
  private ultimaVersionEnvioVista = 0;
  /**
   * Bajar al último mensaje queda pendiente hasta que los mensajes estén de
   * verdad en el hilo. Al abrir un chat primero se ve la fila del listado, sin
   * mensajes; antes la marca de «chat nuevo» se gastaba en ese instante vacío y
   * al llegar los mensajes reales bajar dependía de que ningún evento de
   * scroll intermedio hubiera cambiado `pegadoAlFondo`.
   */
  private bajarAlAbrir = false;

  constructor() {
    /* Las fotos del hilo cargan en diferido: empiezan a bajar DESPUÉS de que el
       hilo salta al fondo y, al llegar, crecen de 0 a hasta 288 px y empujan
       la vista hacia arriba. Por eso al abrir un chat el último mensaje
       quedaba fuera de pantalla (en Safari siempre: no compensa ese salto).
       Mientras se esté al fondo, cada foto o video que termina de cargar
       vuelve a llevarlo al último mensaje; si se subió a leer, no se toca.
       `load` no burbujea: se escucha en captura sobre el contenedor. */
    effect(onCleanup => {
      const container = this.messagesContainer()?.nativeElement;
      if (!container) return;
      const alCrecerMedia = (evento: Event) => {
        const origen = evento.target;
        if (!(origen instanceof HTMLImageElement || origen instanceof HTMLVideoElement)) return;
        if (untracked(this.pegadoAlFondo)) container.scrollTop = container.scrollHeight;
      };
      container.addEventListener('load', alCrecerMedia, true);
      container.addEventListener('loadedmetadata', alCrecerMedia, true);
      onCleanup(() => {
        container.removeEventListener('load', alCrecerMedia, true);
        container.removeEventListener('loadedmetadata', alCrecerMedia, true);
      });
    });

    effect(() => {
      const container = this.messagesContainer()?.nativeElement;
      const anchor = this.bottomAnchor()?.nativeElement;
      const items = this.state.mensajesConFecha();
      const chat = this.state.detalleActual();
      const versionEnvio = this.state.versionEnvioPropio();

      if (!chat) {
        this.scrollInicialListo = false;
        this.chatActualId = '';
        return;
      }

      const esNuevoChat = this.chatActualId !== chat.id;
      this.chatActualId = chat.id;

      if (esNuevoChat) {
        this.scrollInicialListo = false;
        this.bajarAlAbrir = true;
        this.pegadoAlFondo.set(true);
        this.nuevosSinVer.set(0);
        this.ultimoMensajeId = null;
      }

      /* Cuántos mensajes nuevos quedaron DETRÁS del último que ya se había
         visto. Se mira el final del hilo y no el total: cargar historial
         anterior también hace crecer la lista, pero por arriba. */
      const mensajes = items.flatMap(i => (i.tipo === 'separador-fecha' ? [] : [i.mensaje.id]));
      const previo = this.ultimoMensajeId;
      this.ultimoMensajeId = mensajes.at(-1) ?? null;
      if (!esNuevoChat && previo && previo !== this.ultimoMensajeId && !untracked(this.pegadoAlFondo)) {
        const desde = mensajes.lastIndexOf(previo);
        if (desde >= 0) this.nuevosSinVer.update(n => n + (mensajes.length - 1 - desde));
      }

      // Enviar un mensaje propio es una acción deliberada: baja al fondo
      // aunque la agente estuviera leyendo historial viejo en ese momento.
      const esEnvioPropio = versionEnvio !== this.ultimaVersionEnvioVista;
      this.ultimaVersionEnvioVista = versionEnvio;

      /* Sin mensajes todavía (la vista provisional): `bajarAlAbrir` sigue
         pendiente para cuando lleguen. */
      if (!container || !mensajes.length || this.state.detalleEsProvisional()) return;

      // Un chat recién abierto o un envío propio siempre bajan al fondo.
      // Cualquier otro cambio —un mensaje entrante, cargar historial
      // anterior— solo baja si el usuario ya estaba ahí.
      if (!this.bajarAlAbrir && !esEnvioPropio && !untracked(this.pegadoAlFondo)) return;
      this.bajarAlAbrir = false;
      this.pegadoAlFondo.set(true);

      const forzarAbajo = () => {
        container.scrollTop = container.scrollHeight;
        anchor?.scrollIntoView({ behavior: 'instant', block: 'end' });
      };

      forzarAbajo();
      requestAnimationFrame(() => {
        forzarAbajo();
        setTimeout(forzarAbajo, 30);
        setTimeout(forzarAbajo, 80);
        setTimeout(() => {
          forzarAbajo();
          this.scrollInicialListo = true;
        }, 180);
      });
    });
  }

  /* ── Helpers ───────────────────────────────────────────────────── */
  protected enlaceWhatsApp(telefono: string): string {
    return enlaceWhatsApp(telefono);
  }

  protected copiarTexto(texto: string, label: string): void {
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(texto).then(
        () => this.toast.success(`${label} copiado al portapapeles.`),
        () => this.copiarFallback(texto, label),
      );
    } else {
      this.copiarFallback(texto, label);
    }
  }

  private copiarFallback(texto: string, label: string): void {
    try {
      const textarea = document.createElement('textarea');
      textarea.value = texto;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      this.toast.success(`${label} copiado al portapapeles.`);
    } catch {
      this.toast.error(`No se pudo copiar ${label.toLowerCase()}.`);
    }
  }

  protected notaFijadaDe(cliente: { readonly datosExtra?: Record<string, unknown> | null }): string {
    return textoExtra(cliente?.datosExtra, 'notaFijada');
  }

  /** Ver `campanaOrigenDe`: una sola definición, compartida con el panel lateral. */
  protected campanaDe(cliente: ConversacionResumen['cliente']): CampanaOrigen | null {
    return campanaOrigenDe(cliente.datosExtra);
  }

  protected iniciarEdicionNotaFijada(notaActual?: string): void {
    this.state.editNotaFijada.set(notaActual || '');
    this.state.editandoNotaFijada.set(true);
  }

  protected cancelarEdicionNotaFijada(): void {
    this.state.editandoNotaFijada.set(false);
    this.state.editNotaFijada.set('');
  }

  protected guardarNotaFijada(): void {
    void this.state.guardarNotaFijada();
  }

  protected togglePanel(): void {
    this.state.panelAbierto.update(v => !v);
  }

  protected deseleccionar(): void {
    this.state.deseleccionar();
  }

  /* ── Buscador en Chat ─────────────────────────────────────────── */
  protected abrirBusquedaChat(): void {
    this.state.buscadorAbierto.set(true);
    this.state.busquedaChat.set('');
    this.state.indiceCoincidencia.set(0);
  }

  protected cerrarBusquedaChat(): void {
    this.terminoSaltado = '';
    this.state.buscadorAbierto.set(false);
    this.state.busquedaChat.set('');
    this.state.indiceCoincidencia.set(0);
  }

  /** Término al que ya se saltó: el primer Enter va a la PRIMERA coincidencia, no a la segunda. */
  private terminoSaltado = '';

  /**
   * Salta a la coincidencia siguiente (`delta` 1, más antigua) o anterior
   * (-1). Si es de un mensaje todavía no cargado, carga historial hasta
   * encontrarlo: la búsqueda cubre todo el chat, no solo lo visible.
   */
  protected async irACoincidencia(delta: number): Promise<void> {
    const termino = this.state.busquedaChat().trim().toLowerCase();
    if (this.terminoSaltado === termino) this.state.irACoincidencia(delta);
    this.terminoSaltado = termino;

    const id = this.state.coincidenciasChat()[this.state.indiceCoincidencia()];
    if (!id) return;
    /* Que cargar historial no dispare el «bajar al fondo» del hilo. */
    this.pegadoAlFondo.set(false);
    if (!(await this.state.asegurarMensajeCargado(id))) {
      this.toast.info('Ese mensaje es muy antiguo para mostrarlo aquí. Afina la búsqueda.');
      return;
    }
    requestAnimationFrame(() =>
      document.querySelector(`[data-mensaje-id="${id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }),
    );
  }

  /* ── Lightbox & Audio ─────────────────────────────────────────── */
  protected abrirLightbox(url: string): void {
    this.lightboxUrl.set(url);
  }

  protected cerrarLightbox(): void {
    this.lightboxUrl.set(null);
  }

  protected cambiarVelocidadAudio(audioEl: HTMLAudioElement, vel: number): void {
    audioEl.playbackRate = vel;
  }

  protected obtenerVelocidadAudio(audioEl: HTMLAudioElement): number {
    return audioEl?.playbackRate || 1;
  }

  /* ── Scroll Inteligente ────────────────────────────────────────── */
  protected onMessagesScroll(): void {
    const el = this.messagesContainer()?.nativeElement;
    if (!el) return;

    const distanciaAlFondo = el.scrollHeight - el.scrollTop - el.clientHeight;
    const alFondo = distanciaAlFondo < ConversacionThreadComponent.UMBRAL_FONDO_PX;
    this.pegadoAlFondo.set(alFondo);
    if (alFondo) this.nuevosSinVer.set(0);

    if (!this.scrollInicialListo) return;

    // Detectar si está cerca del top para cargar mensajes antiguos
    if (el.scrollTop <= 40 && el.scrollHeight > el.clientHeight && !this.state.cargandoHistorial() && this.state.hayMasHistorial()) {
      const prevScrollHeight = el.scrollHeight;
      void this.state.cargarHistorialAnterior().then(cargados => {
        if (cargados > 0) {
          // Mantener posición visual tras insertar arriba
          setTimeout(() => {
            const newScrollHeight = el.scrollHeight;
            el.scrollTop = newScrollHeight - prevScrollHeight;
          }, 0);
        }
      });
    }
  }

  protected bajarAlFondo(): void {
    const el = this.messagesContainer()?.nativeElement;
    if (el) {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    }
  }

  /**
   * Reintenta un envío fallido sobre el MISMO globo.
   *
   * No crea uno nuevo: se reutiliza el id temporal, así que si el segundo
   * intento sale bien la reconciliación lo sustituye por el real igual que
   * habría hecho el primero, y la agente ve un solo mensaje en su sitio.
   */
  protected async reintentarEnvio(mensaje: MensajeApi): Promise<void> {
    const id = this.state.seleccionadaId();
    /* Lo que hace seguro el reintento —con adjunto o sin él— es el mismo
       `clientMessageId`: el índice único de PostgreSQL devuelve la fila que ya
       existía en vez de crear otra, y ese camino sale ANTES del despacho a
       Meta, así que la paciente no recibe nada dos veces. Sin esa clave —un
       globo viejo, de antes de R2.1— no se ofrece, porque ahí el reintento sí
       podría duplicar. Vale igual para ERROR que para AMBIGUO: la garantía no
       depende de cuánto sabemos del primer intento. */
    const fallido = mensaje.envioLocal === 'ERROR' || mensaje.envioLocal === 'AMBIGUO';
    if (!id || !fallido || !mensaje.clientMessageId) return;

    /* El archivo ya está en R2 desde antes del primer POST, y el globo se
       quedó con su clave. Reenviamos ESA, no una nueva: reintentar no vuelve
       a subir nada. Antes esto mandaba `contenido` a secas y el mensaje habría
       salido sin su imagen, así que el botón estaba desactivado — ese era todo
       el motivo, no una limitación de los datos. */
    const adjunto = mensaje.mediaKey
      ? {
          mediaKey: mensaje.mediaKey,
          mediaMime: mensaje.mediaMime ?? null,
          mediaNombre: mensaje.mediaNombre ?? null,
        }
      : undefined;

    const contexto = this.state.contextoChat();
    this.state.marcarEnvioEnCurso(id, mensaje.id);
    try {
      /* La MISMA clave y el MISMO adjunto del primer intento. */
      const real = await this.conversacionesService.enviarMensaje(
        id, mensaje.contenido, adjunto, mensaje.clientMessageId,
      );
      if (contexto === this.state.contextoChat()) {
        this.state.reconciliarEnvioLocal(id, mensaje.id, real);
      }
    } catch (err) {
      /* Vuelve a fallar: se queda marcado otra vez, sin globo de más — y con
         el estado que corresponda, porque un reintento también puede quedar
         ambiguo y entonces tampoco debe ofrecer otro reintento. */
      if (contexto === this.state.contextoChat()) {
        this.state.marcarEnvioFallido(
          id, mensaje.id, envioSeReintentaSinRiesgo(err) ? 'ERROR' : 'AMBIGUO',
        );
      }
    }
  }

  /** Descarta un globo fallido que la agente no quiere reintentar. */
  protected descartarEnvio(mensaje: MensajeApi): void {
    const id = this.state.seleccionadaId();
    if (!id || (mensaje.envioLocal !== 'ERROR' && mensaje.envioLocal !== 'AMBIGUO')) return;
    this.state.descartarEnvioFallido(id, mensaje.id);
  }
}
