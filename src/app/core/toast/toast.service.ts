import { Injectable, signal } from '@angular/core';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface ToastItem {
  id: string;
  type: ToastType;
  title?: string;
  message: string;
  duration?: number;
  actionLabel?: string;
  onAction?: () => void;
}

@Injectable({
  providedIn: 'root',
})
export class ToastService {
  readonly toasts = signal<ToastItem[]>([]);

  show(
    message: string,
    type: ToastType = 'info',
    title?: string,
    duration = 4000,
    actionLabel?: string,
    onAction?: () => void,
  ): void {
    const id = Math.random().toString(36).substring(2, 9);
    const item: ToastItem = { id, type, title, message, duration, actionLabel, onAction };

    this.toasts.update(current => [...current, item]);

    if (duration > 0) {
      setTimeout(() => {
        this.dismiss(id);
      }, duration);
    }
  }

  success(message: string, title?: string): void {
    this.show(message, 'success', title ?? 'Operación exitosa');
  }

  error(message: string, title?: string): void {
    this.show(message, 'error', title ?? 'Atención');
  }

  info(message: string, title?: string): void {
    this.show(message, 'info', title);
  }

  warning(message: string, title?: string): void {
    this.show(message, 'warning', title);
  }

  dismiss(id: string): void {
    this.toasts.update(current => current.filter(t => t.id !== id));
  }
}
