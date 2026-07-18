import { Component, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { AuthService } from '../../../core/auth/auth.service';
import { NAV_ITEMS } from './nav-items';

/**
 * Layout Shell — Estructura maestra del CRM
 * Ahora consume AuthService.user signal para mostrar datos dinámicos
 * del agente en el topbar y permite cerrar sesión.
 */
@Component({
  selector: 'app-layout',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './layout.component.html',
  styleUrl: './layout.component.css',
})
export class LayoutComponent {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly navItems = NAV_ITEMS;
  protected readonly user = this.authService.user;

  logout(): void {
    this.authService.logout();
    this.router.navigate(['/auth/login']);
  }
}
