import { Overlay, OverlayConfig, OverlayRef } from '@angular/cdk/overlay';
import { TemplatePortal } from '@angular/cdk/portal';
import { DestroyRef, inject, Injectable, TemplateRef, ViewContainerRef } from '@angular/core';

export interface DialogOptions {
  panelClass?: string | string[];
  hasBackdrop?: boolean;
  backdropClass?: string | string[];
  disableClose?: boolean;
}

/**
 * DialogService — Servicio inyectable para abrir modales proyectados en document.body
 * utilizando Angular CDK Overlay.
 * Ref: CRM_MANIFESTO.md §2.11
 */
@Injectable({
  providedIn: 'root',
})
export class DialogService {
  private readonly overlay = inject(Overlay);

  openTemplate(
    templateRef: TemplateRef<unknown>,
    vcr: ViewContainerRef,
    options: DialogOptions = {}
  ): OverlayRef {
    const config = new OverlayConfig({
      hasBackdrop: options.hasBackdrop ?? true,
      backdropClass: options.backdropClass ?? ['fixed', 'inset-0', 'bg-text-dark/60', 'z-[100]'],
      panelClass: options.panelClass ?? ['fixed', 'inset-0', 'z-[101]', 'flex', 'items-center', 'justify-center', 'p-4', 'sm:p-6', 'pointer-events-none'],
      scrollStrategy: this.overlay.scrollStrategies.block(),
      positionStrategy: this.overlay.position().global().centerHorizontally().centerVertically(),
    });

    const overlayRef = this.overlay.create(config);
    const portal = new TemplatePortal(templateRef, vcr);

    overlayRef.attach(portal);

    if (!options.disableClose) {
      overlayRef.backdropClick().subscribe(() => overlayRef.dispose());
    }

    /**
     * Red de seguridad: si el componente que abrió el modal se destruye
     * (el usuario navega a otra vista) sin haberlo cerrado explícitamente,
     * el overlay vive en document.body y no lo destruye el router — quedaba
     * un fondo oscuro huérfano bloqueando los clics de la siguiente página.
     * `vcr.injector` es el inyector del componente dueño del ViewContainerRef,
     * así que esto se autolimpia sin que cada página tenga que implementar
     * OnDestroy y acordarse de llamar dispose().
     */
    vcr.injector.get(DestroyRef).onDestroy(() => overlayRef.dispose());

    return overlayRef;
  }
}
