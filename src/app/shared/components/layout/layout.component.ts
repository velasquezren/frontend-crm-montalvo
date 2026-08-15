import { ChangeDetectionStrategy, Component, ElementRef, HostListener, TemplateRef, ViewContainerRef, computed, inject, signal, viewChild } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { OverlayRef } from '@angular/cdk/overlay';

import { AuthService } from '../../../core/auth/auth.service';
import { cubreRol } from '../../../core/auth/roles';
import { ToastContainerComponent } from '../../../core/toast/toast-container.component';
import { ModoInmersivoService } from '../../../core/ui/modo-inmersivo.service';
import { AvatarComponent } from '../avatar/avatar.component';
import { DialogService } from '../dialog/dialog.service';
import { FabMenuComponent, FabMenuItem } from '../fab-menu/fab-menu.component';
import { IconComponent } from '../icon/icon.component';
import { NAV_GROUPS, NAV_ITEMS } from './nav-items';

/**
 * Layout Shell — Estructura maestra del CRM
 * Consume AuthService.user signal para mostrar datos dinámicos
 * del agente en el topbar y permite cerrar sesión.
 * Las acciones rápidas viven en el FAB flotante (único punto de entrada)
 * y en la barra de búsqueda / salto rápido global.
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
  private readonly dialogService = inject(DialogService);
  private readonly vcr = inject(ViewContainerRef);

  private readonly modalBuscadorRef = viewChild<TemplateRef<unknown>>('modalBuscador');
  private activeOverlayRef?: OverlayRef;

  /** Con un chat abierto en el teléfono, las barras se apartan. Solo aplica
   *  por debajo de 768px: en escritorio el CSS lo ignora. */
  protected readonly inmersivo = inject(ModoInmersivoService).activo;

  protected readonly user = this.authService.user;
  protected readonly sidebarExpanded = signal(false);
  protected readonly busquedaGlobal = signal('');

  /* ── Salto Rápido / Buscador Global ──────────────────────────────── */
  protected readonly accionesRapidas = [
    { label: 'Registro Presencial', path: '/leads/registro-presencial', icon: 'user-plus' as const, desc: 'Dar de alta un nuevo prospecto en recepción' },
    { label: 'Conversaciones WhatsApp', path: '/conversaciones', icon: 'message-circle' as const, desc: 'Bandeja de entrada y chat con pacientes' },
    { label: 'Registrar Venta', path: '/ventas', icon: 'shopping-bag' as const, desc: 'Formulario de cobro y comprobantes' },
    { label: 'Ver Oportunidades (Leads)', path: '/leads', icon: 'filter' as const, desc: 'Embudo de conversión comercial' },
    { label: 'Informe de Comisiones', path: '/reportes', icon: 'bar-chart' as const, desc: 'Analítica mensual y liquidaciones', rolMinimo: 'ADMIN' as const },
    { label: 'Pacientes y Clientes', path: '/clientes', icon: 'users' as const, desc: 'Directorio clínico de pacientes' },
  ];

  protected readonly accionesRapidasFiltradas = computed(() => {
    const q = this.busquedaGlobal().toLowerCase().trim();
    const rol = this.authService.user()?.rol;
    const accesibles = this.accionesRapidas.filter(a => !a.rolMinimo || cubreRol(rol, a.rolMinimo));
    if (!q) return accesibles;
    return accesibles.filter(a => a.label.toLowerCase().includes(q) || a.desc.toLowerCase().includes(q));
  });

  protected readonly modulosFiltrados = computed(() => {
    const q = this.busquedaGlobal().toLowerCase().trim();
    const items = this.navItems();
    if (!q) return items;
    return items.filter(item => item.label.toLowerCase().includes(q) || item.path.toLowerCase().includes(q));
  });

  @HostListener('window:keydown', ['$event'])
  onGlobalKeyDown(event: KeyboardEvent): void {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      this.abrirBuscadorGlobal();
    }
  }

  abrirBuscadorGlobal(): void {
    const tpl = this.modalBuscadorRef();
    if (!tpl) return;
    this.busquedaGlobal.set('');
    this.activeOverlayRef?.dispose();
    this.activeOverlayRef = this.dialogService.openTemplate(tpl, this.vcr);
  }

  cerrarBuscadorGlobal(): void {
    this.activeOverlayRef?.dispose();
    this.activeOverlayRef = undefined;
    this.busquedaGlobal.set('');
  }

  navegarYcerrar(path: string): void {
    this.cerrarBuscadorGlobal();
    void this.router.navigate([path]);
  }

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
