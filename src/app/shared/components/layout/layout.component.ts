import { ChangeDetectionStrategy, Component, ElementRef, HostListener, computed, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { AuthService } from '../../../core/auth/auth.service';
import { ToastContainerComponent } from '../../../core/toast/toast-container.component';
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
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    IconComponent,
    AvatarComponent,
    FabMenuComponent,
    ToastContainerComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './layout.component.html',
  styleUrl: './layout.component.css',
})
export class LayoutComponent {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly elementRef = inject(ElementRef);

  protected readonly user = this.authService.user;
  protected readonly sidebarExpanded = signal(false);

  /* PWA Installation state */
  private deferredPrompt: BeforeInstallPromptEvent | null = null;
  protected readonly showInstallBanner = signal(false);

  @HostListener('window:beforeinstallprompt', ['$event'])
  onBeforeInstallPrompt(event: BeforeInstallPromptEvent): void {
    // Prevent the default browser prompt
    event.preventDefault();
    // Save the event so it can be triggered later
    this.deferredPrompt = event;
    // Show our custom banner
    this.showInstallBanner.set(true);
  }

  @HostListener('window:appinstalled')
  onAppInstalled(): void {
    this.deferredPrompt = null;
    this.showInstallBanner.set(false);
  }

  protected installPwa(): void {
    if (!this.deferredPrompt) return;

    void this.deferredPrompt.prompt();
    void this.deferredPrompt.userChoice.finally(() => {
      /* El banner se cierra en ambos casos: el evento solo puede consumirse una vez. */
      this.deferredPrompt = null;
      this.showInstallBanner.set(false);
    });
  }

  protected dismissInstallBanner(): void {
    this.showInstallBanner.set(false);
  }

  /* Un agente no ve los módulos solo-admin (el backend además los bloquea con @Roles) */
  protected readonly navItems = computed(() =>
    NAV_ITEMS.filter(item => !item.soloAdmin || this.authService.isAdmin()),
  );

  toggleSidebar(event?: MouseEvent): void {
    if (event) {
      event.stopPropagation();
    }
    this.sidebarExpanded.update(v => !v);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.sidebarExpanded()) return;

    const target = event.target as HTMLElement | null;
    const sidebarEl = this.elementRef.nativeElement.querySelector('.sidebar-inner');
    const logoBtnEl = this.elementRef.nativeElement.querySelector('.logo-toggle-btn');

    if (
      target &&
      sidebarEl &&
      !sidebarEl.contains(target) &&
      logoBtnEl &&
      !logoBtnEl.contains(target)
    ) {
      this.sidebarExpanded.set(false);
    }
  }

  /* Acciones rápidas del FAB — el ítem más usado va último (más cerca del botón) */
  protected readonly fabItems: readonly FabMenuItem[] = [
    { icon: 'users', label: 'Gestionar Agentes', path: '/agentes', soloAdmin: true },
    { icon: 'message-circle', label: 'Abrir WhatsApp', path: '/conversaciones' },
    { icon: 'shopping-bag', label: 'Registrar Venta', path: '/ventas' },
    { icon: 'user-plus', label: 'Registro Presencial', path: '/leads/registro-presencial' },
  ];

  logout(): void {
    this.authService.logout();
    this.router.navigate(['/auth/login']);
  }
}
