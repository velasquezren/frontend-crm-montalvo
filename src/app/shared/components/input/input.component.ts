import { Component, computed, input, model, signal } from '@angular/core';

import { IconComponent } from '../icon/icon.component';

export type InputType = 'text' | 'email' | 'password' | 'tel' | 'search';

let nextId = 0;

/**
 * Átomo Input — CRM_MANIFESTO.md §3.2: rounded-xl (12px), focus ring en primary.
 * Two-way binding vía model() — ej. `<app-input [(value)]="email" />`.
 * Los campos password incluyen su propio toggle de visibilidad (sin duplicar lógica en cada pantalla).
 */
@Component({
  selector: 'app-input',
  imports: [IconComponent],
  template: `
    <div class="flex flex-col gap-1.5">
      @if (label()) {
        <label [for]="id" class="text-sm font-medium text-text-dark">{{ label() }}</label>
      }

      <div class="relative">
        <input
          [id]="id"
          [type]="resolvedType()"
          [placeholder]="placeholder()"
          [value]="value()"
          (input)="value.set($any($event.target).value)"
          [autocomplete]="autocomplete()"
          [disabled]="disabled()"
          [class]="inputClasses()" />

        @if (type() === 'password') {
          <button
            type="button"
            (click)="showPassword.set(!showPassword())"
            class="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-primary
                   transition-colors cursor-pointer"
            [attr.aria-label]="showPassword() ? 'Ocultar contraseña' : 'Mostrar contraseña'">
            <app-icon [name]="showPassword() ? 'eye-off' : 'eye'" [size]="18" />
          </button>
        }
      </div>

      @if (error()) {
        <p class="text-xs text-critical">{{ error() }}</p>
      }
    </div>
  `,
})
export class InputComponent {
  readonly id = `crm-input-${nextId++}`;

  readonly label = input<string | undefined>(undefined);
  readonly type = input<InputType>('text');
  readonly placeholder = input<string>('');
  readonly autocomplete = input<string>('off');
  readonly disabled = input(false);
  readonly error = input<string | undefined>(undefined);

  readonly value = model<string>('');

  protected readonly showPassword = signal(false);

  protected readonly resolvedType = computed<string>(() =>
    this.type() === 'password' && this.showPassword() ? 'text' : this.type(),
  );

  protected readonly inputClasses = computed(() => {
    const base =
      'w-full px-4 py-3 rounded-xl border bg-white text-sm text-text-dark ' +
      'transition-all duration-200 outline-none placeholder:text-text-muted/50 ' +
      'disabled:opacity-50 disabled:cursor-not-allowed';

    const border = this.error()
      ? 'border-critical/40 focus:border-critical focus:ring-4 focus:ring-critical/10'
      : 'border-border focus:border-primary focus:ring-4 focus:ring-primary/10';

    const padding = this.type() === 'password' ? 'pr-11' : '';

    return [base, border, padding].join(' ');
  });
}
