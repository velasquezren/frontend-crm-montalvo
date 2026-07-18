import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';

import { AuthService } from '../../core/auth/auth.service';

/**
 * Login Page — Pantalla de acceso al CRM
 * Ref: CRM_MANIFESTO.md §3 (tokens visuales), §2.2 (signals para estado)
 *
 * Estado del formulario gestionado con signal() puro.
 * Se renderiza sin el LayoutComponent (ruta independiente sin guard).
 */
@Component({
  selector: 'app-login',
  templateUrl: './login.page.html',
  styleUrl: './login.page.css',
})
export class LoginPage {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly email = signal('');
  protected readonly password = signal('');
  protected readonly isLoading = signal(false);
  protected readonly errorMessage = signal('');

  onEmailInput(event: Event): void {
    this.email.set((event.target as HTMLInputElement).value);
  }

  onPasswordInput(event: Event): void {
    this.password.set((event.target as HTMLInputElement).value);
  }

  async onSubmit(event: Event): Promise<void> {
    event.preventDefault();
    this.errorMessage.set('');

    if (!this.email().trim() || !this.password().trim()) {
      this.errorMessage.set('Por favor completa todos los campos.');
      return;
    }

    this.isLoading.set(true);

    /* Simular latencia de red (800ms) — se reemplazará por llamada HTTP real */
    await new Promise(resolve => setTimeout(resolve, 800));

    const success = this.authService.login(this.email(), this.password());

    if (success) {
      await this.router.navigate(['/dashboard']);
    } else {
      this.errorMessage.set('Credenciales inválidas. Intenta de nuevo.');
    }

    this.isLoading.set(false);
  }
}
