import { ChangeDetectionStrategy, Component, ElementRef, HostListener, computed, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { AuthService } from '../../../core/auth/auth.service';
import { cubreRol } from '../../../core/auth/roles';
import { ToastContainerComponent } from '../../../core/toast/toast-container.component';
import { ModoInmersivoService } from '../../../core/ui/modo-inmersivo.service';
import { AvatarComponent } from '../avatar/avatar.component';
import { FabMenuComponent, FabMenuItem } from '../fab-menu/fab-menu.component';
import { IconComponent } from '../icon/icon.component';
import { NAV_GROUPS, NAV_ITEMS } from './nav-items';

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

  /** Con un chat abierto en el teléfono, las barras se apartan. Solo aplica
   *  por debajo de 768px: en escritorio el CSS lo ignora. */
  protected readonly inmersivo = inject(ModoInmersivoService).activo;

  protected readonly user = this.authService.user;
  protected readonly isAdmin = this.authService.isAdmin;
  /** En escritorio el sidebar arranca abierto (240px) y el workspace se adapta fluidamente.
   *  En móvil arranca cerrado como drawer. */
  protected readonly sidebarExpanded = signal(
    typeof window !== 'undefined' ? window.innerWidth >= 768 : true,
  );

  /* PWA Installation state */
  private deferredPrompt: BeforeInstallPromptEvent | null = null;
  protected readonly showInstallBanner = signal(false);

  @HostListener('window:beforeinstallprompt', ['$event'])
  onBeforeInstallPrompt(event: BeforeInstallPromptEvent): void {
    // Prevent the default browser prompt
    event.preventDefault();
    // Save the event so it can be triggered later
    this.deferredPrompt = event;
    // Show banner if not dismissed during current session
    if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('crm_pwa_dismissed') !== 'true') {
      this.showInstallBanner.set(true);
    }
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
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem('crm_pwa_dismissed', 'true');
    }
    this.showInstallBanner.set(false);
  }

  /* Se ocultan los módulos que el rol no alcanza (el backend los bloquea igual con @Roles) */
  protected readonly navGroups = computed(() => {
    const rol = this.authService.user()?.rol;
    return NAV_GROUPS
      .map(group => ({
        ...group,
        items: group.items.filter(item => !item.rolMinimo || cubreRol(rol, item.rolMinimo)),
      }))
      .filter(group => group.items.length > 0);
  });

  protected readonly navItems = computed(() => {
    const rol = this.authService.user()?.rol;
    return NAV_ITEMS.filter(item => !item.rolMinimo || cubreRol(rol, item.rolMinimo));
  });

  toggleSidebar(event?: MouseEvent): void {
    if (event) {
      event.stopPropagation();
    }
    this.sidebarExpanded.update(v => !v);
  }

  protected onNavClick(): void {
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      this.sidebarExpanded.set(false);
    }
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.sidebarExpanded()) return;
    // En escritorio el sidebar es parte del layout docked flow, no se cierra al hacer clic en el workspace
    if (typeof window !== 'undefined' && window.innerWidth >= 768) return;

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

  /* Acciones rápidas del FAB — el ítem más usado va último (más cerca del botón).
     Los acentos salen de la paleta cerrada, no de hexadecimales sueltos: antes
     eran un índigo, un esmeralda y un ámbar, justo los tonos que el sistema
     excluye a propósito para sostener la línea "premium médico". El validador
     no los veía porque solo revisaba las plantillas .html. */
  protected readonly fabItems: readonly FabMenuItem[] = [
    /* Administración, no operación del día: gris, se distingue sin competir. */
    { icon: 'users',          label: 'Gestionar Agentes',   path: '/agentes',                   rolMinimo: 'SUPER_ADMIN', accent: 'var(--color-neutral)' },
    { icon: 'message-circle', label: 'Abrir WhatsApp',      path: '/conversaciones',            accent: 'var(--color-secondary)' },
    { icon: 'shopping-bag',   label: 'Registrar Venta',     path: '/ventas',                    accent: 'var(--color-primary)' },
    /* Sin accent: cae en var(--color-primary), que es el fallback del átomo. */
    { icon: 'user-plus',      label: 'Registro Presencial', path: '/leads/registro-presencial' },
  ];

  logout(): void {
    this.authService.logout();
    this.router.navigate(['/auth/login']);
  }
}
