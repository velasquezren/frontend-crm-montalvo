import {
  ChangeDetectionStrategy,
  Component,
  effect,
  ElementRef,
  inject,
  signal,
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
import { textoExtra } from '../../../../core/api/datos-extra';

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
  standalone: true,
  imports: [
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

  /* ── Estado Local de Scroll & Lightbox ─────────────────────────── */
  protected readonly mostrarBotonBajar = signal(false);
  protected readonly lightboxUrl = signal<string | null>(null);
  protected readonly velocidades = signal<Record<string, number>>({});

  constructor() {
    effect(() => {
      const chat = this.state.detalle.value();
      if (!chat) return;

      setTimeout(() => {
        const el = this.messagesContainer()?.nativeElement;
        if (el && !this.mostrarBotonBajar()) {
          el.scrollTop = el.scrollHeight;
        }
      }, 50);
    });
  }

  /* ── Helpers ───────────────────────────────────────────────────── */
  protected enlaceWhatsApp(telefono: string): string {
    return `https://wa.me/${soloDigitos(telefono)}`;
  }

  protected copiarTexto(texto: string, label: string): void {
    navigator.clipboard.writeText(texto).then(() => {
      this.toast.success(`${label} copiado al portapapeles.`);
    });
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

    // Detectar si está cerca del top para cargar mensajes antiguos
    if (el.scrollTop <= 50 && !this.state.cargandoHistorial() && this.state.hayMasHistorial()) {
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

    // Detectar si se alejó del fondo para mostrar botón flotante
    const distanciaFondo = el.scrollHeight - el.scrollTop - el.clientHeight;
    this.mostrarBotonBajar.set(distanciaFondo > 200);
  }

  protected bajarAlFondo(): void {
    const el = this.messagesContainer()?.nativeElement;
    if (el) {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    }
  }
}
