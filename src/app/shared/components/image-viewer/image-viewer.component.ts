import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  TemplateRef,
  ViewContainerRef,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { OverlayRef } from '@angular/cdk/overlay';
import { IconComponent } from '../icon/icon.component';
import { DialogService } from '../dialog/dialog.service';

/**
 * Visor de Imágenes (Lightbox) profesional, responsivo y modular.
 * Proyecta la vista en document.body mediante CDK Overlay para garantizar
 * superposición perfecta sobre header, sidebar y navegación móvil.
 * Soporta arrastre/panning, zoom dinámico, rotación y descarga limpia.
 */
@Component({
  selector: 'app-image-viewer',
  standalone: true,
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './image-viewer.component.html',
})
export class ImageViewerComponent {
  readonly imageUrl = input<string | null>(null);
  readonly title = input<string | undefined>(undefined);
  readonly closed = output<void>();

  private readonly dialogService = inject(DialogService);
  private readonly vcr = inject(ViewContainerRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly modalLightbox = viewChild<TemplateRef<unknown>>('modalLightbox');

  protected readonly zoom = signal<number>(1);
  protected readonly rotation = signal<number>(0);
  protected readonly pan = signal<{ x: number; y: number }>({ x: 0, y: 0 });
  protected readonly isDragging = signal<boolean>(false);
  protected readonly descargando = signal<boolean>(false);

  private overlayRef: OverlayRef | null = null;
  private dragStartPos = { x: 0, y: 0 };
  private touchStartDist = 0;
  private touchStartZoom = 1;

  constructor() {
    effect(() => {
      const url = this.imageUrl();
      if (url) {
        queueMicrotask(() => this.abrirOverlay());
      } else {
        this.cerrarOverlay();
      }
    });

    this.destroyRef.onDestroy(() => this.cerrarOverlay());
  }

  private abrirOverlay(): void {
    const tpl = this.modalLightbox();
    if (!tpl || this.overlayRef) return;

    this.resetTransform();

    this.overlayRef = this.dialogService.openTemplate(tpl, this.vcr, {
      panelClass: ['fixed', 'inset-0', 'z-[99999]', 'pointer-events-auto'],
      backdropClass: ['fixed', 'inset-0', 'bg-black/90', 'backdrop-blur-md', 'z-[99998]'],
    });
  }

  private cerrarOverlay(): void {
    if (this.overlayRef) {
      this.overlayRef.dispose();
      this.overlayRef = null;
    }
  }

  protected cerrar(): void {
    this.cerrarOverlay();
    this.closed.emit();
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

  protected resetTransform(): void {
    this.zoom.set(1);
    this.rotation.set(0);
    this.pan.set({ x: 0, y: 0 });
  }

  protected rotateRight(): void {
    this.rotation.update((r) => (r + 90) % 360);
  }

  protected toggleZoom(event?: MouseEvent): void {
    if (event) event.stopPropagation();
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
    event.preventDefault();
    event.stopPropagation();
    this.isDragging.set(true);
    this.dragStartPos = {
      x: event.clientX - this.pan().x,
      y: event.clientY - this.pan().y,
    };
  }

  protected onMouseMove(event: MouseEvent): void {
    if (!this.isDragging()) return;
    event.preventDefault();
    this.pan.set({
      x: event.clientX - this.dragStartPos.x,
      y: event.clientY - this.dragStartPos.y,
    });
  }

  protected onMouseUp(): void {
    this.isDragging.set(false);
  }

  /* ── Gestos Táctiles Móviles (Pinch Zoom & Drag Pan) ───────────── */
  protected onTouchStart(event: TouchEvent): void {
    if (event.touches.length === 1) {
      this.isDragging.set(true);
      this.dragStartPos = {
        x: event.touches[0].clientX - this.pan().x,
        y: event.touches[0].clientY - this.pan().y,
      };
    } else if (event.touches.length === 2) {
      this.isDragging.set(false);
      this.touchStartDist = this.getTouchDistance(event.touches);
      this.touchStartZoom = this.zoom();
    }
  }

  protected onTouchMove(event: TouchEvent): void {
    if (event.touches.length === 1 && this.isDragging()) {
      this.pan.set({
        x: event.touches[0].clientX - this.dragStartPos.x,
        y: event.touches[0].clientY - this.dragStartPos.y,
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

  /* ── Descarga de Imagen de Alta Fidelidad (Evita archivos de 0KB) ── */
  protected async descargarImagen(): Promise<void> {
    const url = this.imageUrl();
    if (!url) return;

    this.descargando.set(true);
    try {
      const blob = await this.obtenerBlobValido(url);
      const objectUrl = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = this.extraerNombreArchivo(url);
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch {
      // Fallback final: abrir la URL directa en una pestaña nueva si el navegador bloquea CORS
      window.open(url, '_blank', 'noopener,noreferrer');
    } finally {
      this.descargando.set(false);
    }
  }

  private async obtenerBlobValido(url: string): Promise<Blob> {
    // 1. Intentar Fetch directo
    try {
      const response = await fetch(url);
      if (response.ok) {
        const blob = await response.blob();
        if (blob && blob.size > 0) return blob;
      }
    } catch {
      // Si falla por restricción de CORS en R2/S3, pasar al fallback Canvas
    }

    // 2. Intentar Renderizado en Canvas (Soporte Cross-Origin con imagen cargada)
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth || img.width;
          canvas.height = img.naturalHeight || img.height;
          const ctx = canvas.getContext('2d');
          if (!ctx) return reject(new Error('Sin contexto 2D'));
          ctx.drawImage(img, 0, 0);
          canvas.toBlob(
            (blob) => {
              if (blob && blob.size > 0) resolve(blob);
              else reject(new Error('Blob de canvas inválido'));
            },
            'image/jpeg',
            0.95
          );
        } catch (err) {
          reject(err);
        }
      };
      img.onerror = (err) => reject(err);
      img.src = url;
    });
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

  protected compartirImagen(): void {
    const url = this.imageUrl();
    if (!url) return;

    if (typeof navigator !== 'undefined' && navigator.share) {
      navigator.share({ title: this.title() || 'Imagen CRM Montalvo', url }).catch(() => {});
    } else {
      window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(url)}`, '_blank', 'noopener,noreferrer');
    }
  }
}
