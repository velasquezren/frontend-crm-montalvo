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
  protected readonly descargando = signal<boolean>(false);

  private overlayRef: OverlayRef | null = null;

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

    this.zoom.set(1);
    this.rotation.set(0);

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
    this.zoom.update((z) => Math.min(3, +(z + 0.25).toFixed(2)));
  }

  protected zoomOut(): void {
    this.zoom.update((z) => Math.max(0.5, +(z - 0.25).toFixed(2)));
  }

  protected resetTransform(): void {
    this.zoom.set(1);
    this.rotation.set(0);
  }

  protected rotateRight(): void {
    this.rotation.update((r) => (r + 90) % 360);
  }

  protected async descargarImagen(): Promise<void> {
    const url = this.imageUrl();
    if (!url) return;

    this.descargando.set(true);
    try {
      const response = await fetch(url, { mode: 'cors' });
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = `imagen-montalvo-${Date.now()}.jpg`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(objectUrl);
    } catch {
      const a = document.createElement('a');
      a.href = url;
      a.target = '_blank';
      a.download = `imagen-montalvo-${Date.now()}.jpg`;
      a.click();
    } finally {
      this.descargando.set(false);
    }
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
