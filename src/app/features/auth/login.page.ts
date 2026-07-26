import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';

import { AuthService } from '../../core/auth/auth.service';
import { ButtonComponent } from '../../shared/components/button/button.component';
import { IconComponent } from '../../shared/components/icon/icon.component';
import { InputComponent } from '../../shared/components/input/input.component';

/**
 * Login Page — Minimalist Edition (Sin Caja / Split-Screen)
 * Ref: CRM_MANIFESTO.md §3 (tokens visuales), §2.2 (signals para estado), §4 (átomos compartidos)
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-login',
  imports: [InputComponent, ButtonComponent, IconComponent],
  templateUrl: './login.page.html',
  styleUrl: './login.page.css',
})
export class LoginPage {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly email = signal('');
  protected readonly password = signal('');
  protected readonly rememberMe = signal(true);
  protected readonly isLoading = signal(false);
  protected readonly errorMessage = signal('');
  protected readonly currentYear = new Date().getFullYear();



  async onSubmit(event: Event): Promise<void> {
    event.preventDefault();
    this.errorMessage.set('');

    if (!this.email().trim() || !this.password().trim()) {
      this.errorMessage.set('Por favor completa todos los campos.');
      return;
    }

    this.isLoading.set(true);

    const success = await this.authService.login(this.email(), this.password(), this.rememberMe());

    if (success) {
      await this.router.navigate(['/dashboard']);
    } else {
      this.errorMessage.set('Credenciales inválidas o servidor no disponible.');
    }

    this.isLoading.set(false);
  }
}
