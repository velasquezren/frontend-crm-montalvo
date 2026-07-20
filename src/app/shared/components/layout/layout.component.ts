import { Component, computed, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { AuthService } from '../../../core/auth/auth.service';
import { AvatarComponent } from '../avatar/avatar.component';
import { FabMenuComponent, FabMenuItem } from '../fab-menu/fab-menu.component';
import { IconComponent } from '../icon/icon.component';
import { NAV_ITEMS } from './nav-items';

/**
 * Layout Shell — Estructura maestra del CRM
 * Consume AuthService.user signal para mostrar datos dinámicos
 * del agente en el topbar y permite cerrar sesión.
 * Las acciones rápidas viven en el FAB flotante (único punto de entrada).
 */
@Component({
  selector: 'app-layout',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, IconComponent, AvatarComponent, FabMenuComponent],
  templateUrl: './layout.component.html',
  styleUrl: './layout.component.css',
})
export class LayoutComponent {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly user = this.authService.user;

  /* Un agente no ve los módulos solo-admin (el backend además los bloquea con @Roles) */
  protected readonly navItems = computed(() =>
    NAV_ITEMS.filter(item => !item.soloAdmin || this.authService.isAdmin()),
  );

  /* Acciones rápidas del FAB — el ítem más usado va último (más cerca del botón) */
  protected readonly fabItems: readonly FabMenuItem[] = [
    { icon: 'message-circle', label: 'Abrir WhatsApp', path: '/conversaciones' },
    { icon: 'shopping-bag', label: 'Registrar Venta', path: '/ventas' },
    { icon: 'user-plus', label: 'Registro Presencial', path: '/leads/registro-presencial' },
  ];

  logout(): void {
    this.authService.logout();
    this.router.navigate(['/auth/login']);
  }
}
