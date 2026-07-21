import { Component, inject } from '@angular/core';

import { IconComponent } from '../../shared/components/icon/icon.component';
import { ToastService } from './toast.service';

@Component({
  selector: 'app-toast-container',
  imports: [IconComponent],
  template: `
    <div class="fixed bottom-5 right-5 z-50 flex flex-col gap-2.5 max-w-sm w-full pointer-events-none px-4">
      @for (toast of toasts(); track toast.id) {
        <div
          class="pointer-events-auto flex items-start gap-3 p-4 rounded-2xl shadow-xl border backdrop-blur-md transition-all duration-300 animate-toast-slide"
          [class]="getClasses(toast.type)">

          <div class="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" [class]="getIconBg(toast.type)">
            <app-icon [name]="getIconName(toast.type)" [size]="18" />
          </div>

          <div class="flex-1 min-w-0 pr-1">
            @if (toast.title) {
              <h4 class="text-xs font-bold leading-snug tracking-wide uppercase opacity-90 mb-0.5">
                {{ toast.title }}
              </h4>
            }
            <p class="text-xs font-medium leading-relaxed">
              {{ toast.message }}
            </p>
          </div>

          <button
            type="button"
            (click)="dismiss(toast.id)"
            class="text-current opacity-50 hover:opacity-100 transition-opacity p-1 cursor-pointer">
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

  getClasses(type: string): string {
    switch (type) {
      case 'success':
        return 'bg-emerald-900/90 text-white border-emerald-700/50 shadow-emerald-950/20';
      case 'error':
        return 'bg-rose-900/90 text-white border-rose-700/50 shadow-rose-950/20';
      case 'warning':
        return 'bg-amber-900/90 text-white border-amber-700/50 shadow-amber-950/20';
      default:
        return 'bg-slate-900/90 text-white border-slate-700/50 shadow-slate-950/20';
    }
  }

  getIconBg(type: string): string {
    switch (type) {
      case 'success':
        return 'bg-emerald-500/20 text-emerald-300';
      case 'error':
        return 'bg-rose-500/20 text-rose-300';
      case 'warning':
        return 'bg-amber-500/20 text-amber-300';
      default:
        return 'bg-sky-500/20 text-sky-300';
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
