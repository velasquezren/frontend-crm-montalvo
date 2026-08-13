import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  OnInit,
  ViewChild,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { IconComponent } from '../icon/icon.component';

/**
 * Visor de Imágenes (Lightbox) profesional, responsivo y de alto rendimiento.
 * Diseñado para CRM Montalvo siguiendo la arquitectura atómica y sin emojis.
 */
@Component({
  selector: 'app-image-viewer',
  standalone: true,
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './image-viewer.component.html',
  styleUrl: './image-viewer.component.css',
})
export class ImageViewerComponent implements OnInit, OnDestroy {
  readonly imageUrl = input<string | null>(null);
  readonly title = input<string | undefined>(undefined);
  readonly closed = output<void>();

  @ViewChild('imageRef') private imageRef?: ElementRef<HTMLImageElement>;

  protected readonly zoom = signal<number>(1);
  protected readonly rotation = signal<number>(0);
  protected readonly pan = signal<{ x: number; y: number }>({ x: 0, y: 0 });
  protected readonly loading = signal<boolean>(true);
  protected readonly hasError = signal<boolean>(false);
  protected readonly isDragging = signal<boolean>(false);
  protected readonly downloading = signal<boolean>(false);

  private dragStartPos = { x: 0, y: 0 };
  private panStartPos = { x: 0, y: 0 };
  private touchStartDist = 0;
  private touchStartZoom = 1;

  constructor() {
    // Resetear estados cuando cambie la URL de la imagen
    effect(() => {
      const url = this.imageUrl();
      if (url) {
        this.loading.set(true);
        this.hasError.set(false);
        this.resetTransform();
      }
    });
  }

  ngOnInit(): void {
    // Bloquear scroll de fondo para evitar desplazamientos accidentales
    if (typeof document !== 'undefined') {
      document.body.style.overflow = 'hidden';
    }
  }

  ngOnDestroy(): void {
    if (typeof document !== 'undefined') {
      document.body.style.overflow = '';
    }
  }

  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    this.cerrar();
  }

  protected resetTransform(): void {
    this.zoom.set(1);
    this.rotation.set(0);
    this.pan.set({ x: 0, y: 0 });
  }

  protected cerrar(): void {
    this.resetTransform();
    this.closed.emit();
  }

  protected onImageLoad(): void {
    this.loading.set(false);
    this.hasError.set(false);
  }

  protected onImageError(): void {
    this.loading.set(false);
    this.hasError.set(true);
  }

  protected zoomIn(): void {
    this.zoom.update((z) => Math.min(4, +(z + 0.25).toFixed(2)));
  }

  protected zoomOut(): void {
    this.zoom.update((z) => {
      const next = +(z - 0.25).toFixed(2);
      if (next <= 1) {
        this.pan.set({ x: 0, y: 0 });
      }
      return Math.max(0.5, next);
    });
  }

  protected rotateRight(): void {
    this.rotation.update((r) => (r + 90) % 360);
  }

  protected toggleZoom(event?: MouseEvent): void {
    if (event) {
      event.stopPropagation();
    }
    if (this.zoom() > 1) {
      this.resetTransform();
    } else {
      this.zoom.set(2);
    }
  }

  protected onWheel(event: WheelEvent): void {
    event.preventDefault();
    if (event.deltaY < 0) {
      this.zoomIn();
    } else if (event.deltaY > 0) {
      this.zoomOut();
    }
  }

  /* ── Arrastre / Panning con Mouse ───────────────────────────── */
  protected onMouseDown(event: MouseEvent): void {
    if (this.zoom() <= 1) return;
    event.preventDefault();
    this.isDragging.set(true);
    this.dragStartPos = { x: event.clientX, y: event.clientY };
    this.panStartPos = { ...this.pan() };
  }

  protected onMouseMove(event: MouseEvent): void {
    if (!this.isDragging()) return;
    const dx = event.clientX - this.dragStartPos.x;
    const dy = event.clientY - this.dragStartPos.y;
    this.pan.set({
      x: this.panStartPos.x + dx,
      y: this.panStartPos.y + dy,
    });
  }

  protected onMouseUp(): void {
    this.isDragging.set(false);
  }

  /* ── Gestos Táctiles Móviles (Pinch to Zoom & Touch Pan) ──────── */
  protected onTouchStart(event: TouchEvent): void {
    if (event.touches.length === 1) {
      if (this.zoom() > 1) {
        this.isDragging.set(true);
        this.dragStartPos = { x: event.touches[0].clientX, y: event.touches[0].clientY };
        this.panStartPos = { ...this.pan() };
      }
    } else if (event.touches.length === 2) {
      this.isDragging.set(false);
      this.touchStartDist = this.getTouchDistance(event.touches);
      this.touchStartZoom = this.zoom();
    }
  }

  protected onTouchMove(event: TouchEvent): void {
    if (event.touches.length === 1 && this.isDragging() && this.zoom() > 1) {
      const dx = event.touches[0].clientX - this.dragStartPos.x;
      const dy = event.touches[0].clientY - this.dragStartPos.y;
      this.pan.set({
        x: this.panStartPos.x + dx,
        y: this.panStartPos.y + dy,
      });
    } else if (event.touches.length === 2) {
      const dist = this.getTouchDistance(event.touches);
      if (this.touchStartDist > 0) {
        const scale = dist / this.touchStartDist;
        const newZoom = Math.min(4, Math.max(0.5, +(this.touchStartZoom * scale).toFixed(2)));
        this.zoom.set(newZoom);
      }
    }
  }

  protected onTouchEnd(event: TouchEvent): void {
    if (event.touches.length < 2) {
      this.touchStartDist = 0;
    }
    if (event.touches.length === 0) {
      this.isDragging.set(false);
    }
  }

  private getTouchDistance(touches: TouchList): number {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.hypot(dx, dy);
  }

  /* ── Acciones: Descarga & Compartir WhatsApp / Nativo ────────── */
  protected async descargarImagen(): Promise<void> {
    const url = this.imageUrl();
    if (!url) return;

    this.downloading.set(true);
    try {
      const response = await fetch(url, { mode: 'cors' });
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = this.extraerNombreArchivo(url);
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(objectUrl);
    } catch {
      // Fallback si falla CORS: apertura en pestaña directa con flag download
      const a = document.createElement('a');
      a.href = url;
      a.target = '_blank';
      a.download = this.extraerNombreArchivo(url);
      a.click();
    } finally {
      this.downloading.set(false);
    }
  }

  protected async compartirImagen(): Promise<void> {
    const url = this.imageUrl();
    if (!url) return;

    // 1. Intentar API Web Share nativa de móviles (WhatsApp, Guardar, etc.)
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: this.title() || 'Imagen de CRM Montalvo',
          text: 'Imagen compartida desde CRM Montalvo',
          url: url,
        });
        return;
      } catch (err) {
        // Si el usuario canceló la acción de compartir nativa, no hacer nada más
        if ((err as Error).name === 'AbortError') return;
      }
    }

    // 2. Fallback WhatsApp Web / API de envío directo
    const waUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(url)}`;
    window.open(waUrl, '_blank', 'noopener,noreferrer');
  }

  private extraerNombreArchivo(url: string): string {
    try {
      const parsed = new URL(url);
      const pathname = parsed.pathname;
      const filename = pathname.substring(pathname.lastIndexOf('/') + 1);
      if (filename && filename.includes('.')) {
        return filename;
      }
    } catch {
      // url relativa
    }
    return `imagen-crm-${Date.now()}.jpg`;
  }
}
