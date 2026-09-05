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
import { ConversacionesStateService } from '../../services/conversaciones-state.service';
import { ConversacionResumen } from '../../conversacion.model';
import { textoExtra } from '../../../../core/api/datos-extra';
import { InicialesClientePipe, NombreClientePipe } from '../../../../shared/pipes/nombre-cliente.pipe';

function soloDigitos(telefono: string): string {
  return telefono.replace(/\D/g, '');
}

/**
 * Panel central del chat: cabecera del paciente, aviso clínico fijado,
 * lista de mensajes agrupados por fecha con reproductor de audio,
 * previsualizador de medios y visor de imágenes (Lightbox).
 */
@Component({
  selector: 'app-conversacion-thread',
  imports: [
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
  protected readonly state = inject(ConversacionesStateService);
  private readonly toast = inject(ToastService);

  protected readonly iniciales = generarIniciales;
  private readonly messagesContainer = viewChild<ElementRef<HTMLElement>>('messagesScroll');
  private readonly bottomAnchor = viewChild<ElementRef<HTMLElement>>('bottomAnchor');

  /* ── Estado Local de Scroll & Lightbox ─────────────────────────── */
  protected readonly lightboxUrl = signal<string | null>(null);
  protected readonly velocidades = signal<Record<string, number>>({});
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
  private static readonly UMBRAL_FONDO_PX = 120;
  private ultimaVersionEnvioVista = 0;

  constructor() {
    effect(() => {
      const container = this.messagesContainer()?.nativeElement;
      const anchor = this.bottomAnchor()?.nativeElement;
      const items = this.state.mensajesConFecha();
      const chat = this.state.detalle.value();
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
        this.pegadoAlFondo.set(true);
      }

      // Enviar un mensaje propio es una acción deliberada: baja al fondo
      // aunque la agente estuviera leyendo historial viejo en ese momento.
      const esEnvioPropio = versionEnvio !== this.ultimaVersionEnvioVista;
      this.ultimaVersionEnvioVista = versionEnvio;

      if (!container || items.length === 0) return;

      // Un chat nuevo o un envío propio siempre bajan al fondo. Cualquier
      // otro cambio —un mensaje entrante, cargar historial anterior— solo
      // baja si el usuario ya estaba ahí.
      if (!esNuevoChat && !esEnvioPropio && !untracked(this.pegadoAlFondo)) return;

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
    return `https://wa.me/${soloDigitos(telefono)}`;
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

  protected esUrlImagen(url?: string | null): boolean {
    if (!url) return false;
    return /\.(jpeg|jpg|gif|png|webp)($|\?)/i.test(url);
  }

  protected esUrlPdf(url?: string | null): boolean {
    if (!url) return false;
    return /\.pdf($|\?)/i.test(url);
  }

  protected notaFijadaDe(cliente: { readonly datosExtra?: Record<string, unknown> | null }): string {
    return textoExtra(cliente?.datosExtra, 'notaFijada');
  }

  protected campanaDe(cliente: ConversacionResumen['cliente']): { titular?: string; anuncioId?: string } | null {
    const raw = cliente.datosExtra?.['campanaOrigen'];
    if (raw && typeof raw === 'object') {
      const c = raw as Record<string, unknown>;
      const titular = typeof c['titular'] === 'string' ? c['titular'] : undefined;
      const anuncioId = typeof c['anuncioId'] === 'string' ? c['anuncioId'] : undefined;
      if (titular || anuncioId) {
        return { titular, anuncioId };
      }
    }
    return null;
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
    this.state.buscadorAbierto.set(false);
    this.state.busquedaChat.set('');
    this.state.indiceCoincidencia.set(0);
  }

  protected irACoincidencia(delta: number): void {
    this.state.irACoincidencia(delta);
    const matches = this.state.coincidenciasChat();
    const idx = this.state.indiceCoincidencia();
    if (matches.length > 0 && matches[idx]) {
      const el = document.querySelector(`[data-mensaje-id="${matches[idx]}"]`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
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
    this.pegadoAlFondo.set(distanciaAlFondo < ConversacionThreadComponent.UMBRAL_FONDO_PX);

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
}
