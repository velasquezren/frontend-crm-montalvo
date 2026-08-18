import { Component, inject } from '@angular/core';

import { IconComponent } from '../../shared/components/icon/icon.component';
import { ToastService } from './toast.service';

/**
 * ToastContainerComponent — Sistema de Notificaciones Flotantes Premium
 * Posicionado en Top-Right para no colisionar con el FAB Menu ni la Bottom Bar.
 * Diseño Glassmorphism limpio alineado con los tokens de Clínicas Montalvo.
 */
@Component({
  selector: 'app-toast-container',
  imports: [IconComponent],
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
              <button
                type="button"
                (click)="toast.onAction(); dismiss(toast.id)"
                class="mt-2.5 inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary hover:bg-primary-dark text-white text-xs font-semibold rounded-xl transition-all shadow-xs hover:shadow-md cursor-pointer active:scale-95">
                <span>{{ toast.actionLabel }}</span>
              </button>
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
        return 'bg-emerald-50 text-emerald-600 border-emerald-200/60';
      case 'error':
        return 'bg-rose-50 text-rose-600 border-rose-200/60';
      case 'warning':
        return 'bg-amber-50 text-amber-600 border-amber-200/60';
      default:
        return 'bg-sky-50 text-sky-600 border-sky-200/60';
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
