import { Overlay, OverlayConfig, OverlayRef } from '@angular/cdk/overlay';
import { TemplatePortal } from '@angular/cdk/portal';
import { DestroyRef, inject, Injectable, TemplateRef, ViewContainerRef } from '@angular/core';

export interface DialogOptions {
  panelClass?: string | string[];
  hasBackdrop?: boolean;
  backdropClass?: string | string[];
  disableClose?: boolean;
  onClose?: () => void;
}

/**
 * Panel del cajón lateral: pega el contenido al borde derecho de la pantalla.
 *
 * Vive aquí y no en cada página porque estaba copiado literal en nueve sitios
 * —`['fixed','inset-0','z-[101]','flex','justify-end','pointer-events-none']`—
 * y una constante que se copia deja de ser una constante: basta que un sitio se
 * olvide de `pointer-events-none` para que un panel invisible se coma los clics
 * de toda la página.
 */
const PANEL_CAJON = ['fixed', 'inset-0', 'z-[101]', 'flex', 'justify-end', 'pointer-events-none'];

/**
 * DialogService — abre plantillas proyectadas en `document.body` con CDK
 * Overlay, fuera del árbol de la página.
 *
 * Ref: CRM_MANIFESTO.md §2.11
 */
@Injectable({
  providedIn: 'root',
})
export class DialogService {
  private readonly overlay = inject(Overlay);

  /**
   * Cajón lateral (`<app-drawer>`). Es `openTemplate` con el panel pegado a la
   * derecha; se expone aparte para que ninguna vista vuelva a escribir a mano
   * las clases del panel.
   */
  abrirCajon(
    templateRef: TemplateRef<unknown>,
    vcr: ViewContainerRef,
    options: Omit<DialogOptions, 'panelClass'> = {},
  ): OverlayRef {
    return this.openTemplate(templateRef, vcr, { ...options, panelClass: PANEL_CAJON });
  }

  openTemplate(
    templateRef: TemplateRef<unknown>,
    vcr: ViewContainerRef,
    options: DialogOptions = {},
  ): OverlayRef {
    const config = new OverlayConfig({
      hasBackdrop: options.hasBackdrop ?? true,
      backdropClass: options.backdropClass ?? ['fixed', 'inset-0', 'bg-black/50', 'z-[100]'],
      panelClass: options.panelClass ?? ['fixed', 'inset-0', 'z-[101]', 'flex', 'items-center', 'justify-center', 'p-4', 'sm:p-6', 'pointer-events-none'],
      scrollStrategy: this.overlay.scrollStrategies.block(),
      positionStrategy: this.overlay.position().global().centerHorizontally().centerVertically(),
    });

    const overlayRef = this.overlay.create(config);
    const portal = new TemplatePortal(templateRef, vcr);

    overlayRef.attach(portal);

    if (!options.disableClose) {
      const cerrar = () => {
        options.onClose?.();
        overlayRef.dispose();
      };

      overlayRef.backdropClick().subscribe(cerrar);

      /**
       * Escape cierra, y lo hace aquí para todos.
       *
       * Antes solo cerraban con Escape los modales de Pacientes y Usuarios,
       * porque esas dos páginas se habían escrito su propio
       * `@HostListener('document:keydown.escape')`. Las otras nueve no, así que
       * la misma tecla funcionaba o no según en qué pantalla estuvieras — y un
       * cajón a pantalla completa sin salida por teclado deja atrapado a quien
       * no usa el ratón. El overlay ya recibe los eventos de teclado mientras
       * está abierto (`keydownEvents`), así que no hace falta escuchar en
       * `document` ni acordarse de desuscribirse: el `dispose()` se lo lleva.
       */
      overlayRef.keydownEvents().subscribe(evento => {
        if (evento.key !== 'Escape') return;
        evento.preventDefault();
        cerrar();
      });
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
