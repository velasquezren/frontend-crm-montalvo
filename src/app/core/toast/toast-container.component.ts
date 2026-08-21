import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { ButtonComponent } from '../../shared/components/button/button.component';
import { IconComponent } from '../../shared/components/icon/icon.component';
import { ToastService } from './toast.service';

/**
 * ToastContainerComponent — Sistema de Notificaciones Flotantes Premium
 * Posicionado en Top-Right para no colisionar con el FAB Menu ni la Bottom Bar.
 * Diseño Glassmorphism limpio alineado con los tokens de Clínicas Montalvo.
 */
@Component({
  selector: 'app-toast-container',
  imports: [IconComponent, ButtonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="fixed top-4 right-4 sm:top-5 sm:right-5 w-[calc(100%-2rem)] sm:w-auto sm:max-w-sm z-50 flex flex-col gap-2.5 pointer-events-none">
      @for (toast of toasts(); track toast.id) {
        <div
          class="pointer-events-auto flex items-start gap-3.5 p-4 rounded-2xl bg-white border border-border text-text-dark shadow-lifted transition-all duration-200 animate-toast-slide">

          <!-- Ícono temático -->
          <div class="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border" [class]="getIconBg(toast.type)">
            <app-icon [name]="getIconName(toast.type)" [size]="18" />
          </div>

          <!-- Contenido -->
          <div class="flex-1 min-w-0 pr-1">
            @if (toast.title) {
              <h4 class="text-xs font-bold text-text-dark tracking-tight mb-0.5">
                {{ toast.title }}
              </h4>
            }
            <p class="text-xs font-medium text-text-muted leading-relaxed">
              {{ toast.message }}
            </p>
            @if (toast.actionLabel && toast.onAction) {
              <app-button size="sm" class="mt-2.5 inline-block" (clicked)="toast.onAction(); dismiss(toast.id)">
                {{ toast.actionLabel }}
              </app-button>
            }
          </div>

          <!-- Botón Cerrar -->
          <button
            type="button"
            (click)="dismiss(toast.id)"
            class="text-text-muted hover:text-text-dark hover:bg-bg-light p-1 rounded-lg transition-colors cursor-pointer shrink-0"
            aria-label="Cerrar notificación">
            <app-icon name="x" [size]="14" />
          </button>
        </div>
      }
    </div>
  `,
})
export class ToastContainerComponent {
  private readonly toastService = inject(ToastService);
  protected readonly toasts = this.toastService.toasts;

  dismiss(id: string): void {
    this.toastService.dismiss(id);
  }

  getIconBg(type: string): string {
    switch (type) {
      case 'success':
        return 'bg-success-bg text-success border-success/20';
      case 'error':
      case 'warning':
        /* La paleta cerrada no tiene un quinto tono de alarma — nada de
           ámbar, es deliberado (CRM_MANIFESTO.md §3.4). "Warning" no es una
           variante propia ni en <app-badge>: error y warning comparten el
           tono crítico (negro), y el ícono (x-circle / alert-circle) es lo
           que los distingue. */
        return 'bg-critical-bg text-critical border-critical/20';
      default:
        return 'bg-info-bg text-info border-info/20';
    }
  }

  getIconName(type: string): 'check-circle' | 'alert-circle' | 'x-circle' | 'clock' {
    switch (type) {
      case 'success':
        return 'check-circle';
      case 'error':
        return 'x-circle';
      case 'warning':
        return 'alert-circle';
      default:
        return 'alert-circle';
    }
  }
}
