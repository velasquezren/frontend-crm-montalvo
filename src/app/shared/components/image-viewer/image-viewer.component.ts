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
 * Soporta arrastre/panning, zoom dinámico y rotación.
 *
 * **No lleva botón de descargar, y es una decisión, no un olvido.** Se intentó
 * cinco veces (d303e7a, 79c2c73, 5cce674, a00504c, 75c2cce): descarga directa,
 * blob por XHR, proxy del backend para esquivar el CORS de R2, extracción de la
 * `mediaKey` desde la URL firmada… y seguía sin bajar el archivo de forma
 * fiable. La descarga se delega al navegador: clic derecho → "Guardar imagen
 * como…" en escritorio, pulsación larga en móvil. Es el mecanismo nativo, no
 * tiene CORS que esquivar ni token que adjuntar, y las agentes ya lo conocen.
 *
 * Por eso `onMouseDown` ignora todo lo que no sea el botón primario: hacía
 * `preventDefault()` con cualquier botón, y eso se comía el menú contextual —
 * justo el que ahora sostiene la única vía de descarga.
 */
@Component({
  selector: 'app-image-viewer',
  standalone: true,
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './image-viewer.component.html',
  styles: `
    /**
     * La pulsación larga es la ÚNICA vía de guardado en móvil, así que la
     * imagen tiene que quedar fuera de las reglas que la anulan.
     *
     * El contenedor lleva select-none —correcto: no se quiere seleccionar el
     * texto de la barra al arrastrar— pero en iOS Safari 'user-select: none'
     * también suprime el menú de "Guardar imagen" de la pulsación larga, y
     * '-webkit-touch-callout' es lo único que lo gobierna explícitamente. Sin
     * estas tres líneas, el aviso de abajo prometería algo que no ocurre.
     */
    .imagen-guardable {
      -webkit-touch-callout: default;
      -webkit-user-select: auto;
      user-select: auto;
    }
  `,
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
      backdropClass: ['fixed', 'inset-0', 'bg-black/95', 'z-[99998]'],
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
    /* Solo el botón primario arrastra. Sin esto, el clic derecho también
       entraba aquí y su `preventDefault()` bloqueaba el menú contextual, que es
       de donde sale "Guardar imagen como…" — la única vía de descarga. */
    if (event.button !== 0) return;

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
