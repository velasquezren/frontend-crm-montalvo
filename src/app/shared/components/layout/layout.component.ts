import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, HostListener, computed, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { MonedaService } from '../../../core/moneda/moneda.service';
import { AuthService } from '../../../core/auth/auth.service';
import { cubreRol, ROL_LABEL } from '../../../core/auth/roles';
import { ActualizacionDisponibleComponent } from '../../../core/pwa/actualizacion-disponible.component';
import { ToastContainerComponent } from '../../../core/toast/toast-container.component';
import { ModoInmersivoService } from '../../../core/ui/modo-inmersivo.service';
import { AvatarComponent } from '../avatar/avatar.component';
import { ButtonComponent } from '../button/button.component';
import { IconComponent } from '../icon/icon.component';
import { MonedaToggleComponent } from '../moneda-toggle/moneda-toggle.component';
import { NotificacionesBellComponent } from '../notificaciones-bell/notificaciones-bell.component';
import { NAV_GROUPS } from './nav-items';

/**
 * Layout Shell — Estructura maestra del CRM
 * Consume AuthService.user signal para mostrar datos dinámicos
 * del agente en el topbar y permite cerrar sesión.
 */
@Component({
  selector: 'app-layout',
  imports: [
    ButtonComponent,
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    IconComponent,
    AvatarComponent,
    ActualizacionDisponibleComponent,
    MonedaToggleComponent,
    NotificacionesBellComponent,
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

  /**
   * El tipo de cambio se pide UNA vez, aquí y no en `provideAppInitializer`.
   *
   * Este componente es el armazón de la sesión iniciada: existe solo cuando hay
   * usuario, así que la petición nunca sale sin token —ni en la pantalla de
   * login— y se hace igual tras un login nuevo que tras un F5. Se dispara con
   * `void` porque nada debe esperarla: mientras no responda se usa el TC de
   * respaldo y la aplicación pinta al instante.
   */
  private readonly moneda = inject(MonedaService);

  /** Con un chat abierto en el teléfono, las barras se apartan. Solo aplica
   *  por debajo de 768px: en escritorio el CSS lo ignora. */
  protected readonly inmersivo = inject(ModoInmersivoService).activo;

  constructor() {
    if (this.authService.puedeGestionComercial()) void this.moneda.cargarTipoCambio();
    this.volverArribaAlCambiarDePagina();
    this.escucharCambioDeAnchura();
  }

  /**
   * Al cambiar de página, el contenido arranca arriba.
   *
   * Quien scrollea NO es el documento —`.layout-grid` es `overflow: hidden`—
   * sino `.workspace`, así que ni la restauración del navegador ni
   * `withInMemoryScrolling` tocan nada: el `scrollTop` del contenedor
   * sobrevivía a la navegación. Bajabas la lista de Clientes, abrías Agenda y
   * aparecía a media altura, sin cabecera a la vista. Eso, sumado al fundido,
   * era buena parte de la sensación de "refresh raro".
   *
   * Se compara la ruta SIN query params a propósito: Conversaciones navega a
   * `?id=…` en cada chat que se abre, y eso no es cambiar de página.
   */
  private volverArribaAlCambiarDePagina(): void {
    const destroyRef = inject(DestroyRef);
    let rutaPrevia = this.router.url.split('?')[0];

    const suscripcion = this.router.events.subscribe(evento => {
      if (!(evento instanceof NavigationEnd)) return;
      const ruta = evento.urlAfterRedirects.split('?')[0];
      if (ruta === rutaPrevia) return;
      rutaPrevia = ruta;
      const workspace = (this.elementRef.nativeElement as HTMLElement).querySelector('.workspace');
      if (workspace) workspace.scrollTop = 0;
    });

    destroyRef.onDestroy(() => suscripcion.unsubscribe());
  }

  protected readonly user = this.authService.user;
  protected readonly puedeGestionComercial = this.authService.puedeGestionComercial;
  /** Para la plantilla: nunca comparar `rol === 'ADMIN'` a mano (deja fuera a SUPER_ADMIN). */
  protected readonly rolLabel = ROL_LABEL;
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
        items: group.items.filter(
          item =>
            (!item.rolMinimo && !item.roles) ||
            (item.rolMinimo !== undefined && cubreRol(rol, item.rolMinimo)) ||
            (rol !== undefined && item.roles?.includes(rol) === true),
        ),
      }))
      .filter(group => group.items.length > 0);
  });

  /**
   * ¿Estamos en el teléfono? Mismo corte que el CSS del shell (`max-width: 768px`).
   *
   * Es una señal y no un `window.innerWidth` leído al vuelo porque la plantilla
   * la consulta: sin reactividad, girar el teléfono dejaría el `title` y el
   * `aria-label` del logo describiendo la disposición anterior.
   */
  protected readonly esMovil = signal(
    typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches,
  );

  /** Mantiene `esMovil` al día: girar el teléfono cambia de disposición. */
  private escucharCambioDeAnchura(): void {
    if (typeof window === 'undefined') return;
    const destroyRef = inject(DestroyRef);
    const consulta = window.matchMedia('(max-width: 768px)');
    const alCambiar = (e: MediaQueryListEvent) => {
      this.esMovil.set(e.matches);
      /* Al pasar a teléfono, un cajón abierto se queda flotando sobre el
         contenido sin nada que lo haya pedido. */
      if (e.matches) this.sidebarExpanded.set(false);
    };
    consulta.addEventListener('change', alCambiar);
    destroyRef.onDestroy(() => consulta.removeEventListener('change', alCambiar));
  }

  toggleSidebar(event?: MouseEvent): void {
    if (event) {
      event.stopPropagation();
    }
    this.sidebarExpanded.update(v => !v);
  }

  /* ── Cajón del teléfono: arrastrar hacia la izquierda para cerrarlo ──
   *
   * Es el gesto que la guía de Material da por sentado en un cajón modal
   * («swiping the drawer toward its anchoring edge»), junto con tocar el velo.
   * Sin él, la única salida era tocar fuera: se sentía atrapado.
   *
   * Dos decisiones que no son obvias:
   *
   * - **El arrastre solo empieza si el dedo va más en horizontal que en
   *   vertical.** La lista de navegación scrollea, y secuestrar un desliz
   *   vertical para cerrar el cajón es peor que no tener gesto.
   * - **Se cierra por distancia, no por velocidad.** Un umbral de un tercio del
   *   ancho es predecible; medir velocidad obliga a elegir un límite que acierta
   *   con unos pulgares y falla con otros.
   */
  /* El CSS usa `min(280px, 85vw)`. En una pantalla de menos de ~330px el cajón
     será algo más estrecho que esta constante, así que el velo no llega a
     transparencia total al arrastrarlo del todo. Son unos pocos píxeles y no
     compensa leer el ancho real del DOM en cada `touchmove`. */
  private static readonly ANCHO_CAJON = 280;
  /** A partir de aquí, soltar cierra. Un tercio: se nota que ya no vuelve. */
  private static readonly UMBRAL_CIERRE = LayoutComponent.ANCHO_CAJON / 3;

  private toqueX = 0;
  private toqueY = 0;
  /**
   * Tres estados, no un booleano.
   *
   * Con un booleano «ya decidí» no se distingue «decidí que SÍ es un cierre» de
   * «decidí que NO lo es», y un desliz en diagonal acababa arrastrando el cajón
   * a mitad de un scroll de la lista.
   */
  private gesto: 'indeciso' | 'cerrando' | 'ignorado' = 'indeciso';

  /** Px arrastrados hacia la izquierda; `null` mientras no hay gesto activo. */
  protected readonly desplazamientoCajon = signal<number | null>(null);
  protected readonly arrastrandoCajon = computed(() => this.desplazamientoCajon() !== null);

  /** El cajón sigue al dedo. Sin gesto, manda el CSS (por eso `null`). */
  protected readonly transformCajon = computed(() => {
    const dx = this.desplazamientoCajon();
    return dx === null ? null : `translateX(${-dx}px)`;
  });

  /** El velo se aclara a la vez que el cajón se va, como pide Material. */
  protected readonly opacidadVelo = computed(() => {
    const dx = this.desplazamientoCajon();
    return dx === null ? null : String(1 - dx / LayoutComponent.ANCHO_CAJON);
  });

  protected alTocarCajon(evento: TouchEvent): void {
    if (!this.esMovil() || !this.sidebarExpanded()) return;
    const toque = evento.touches[0];
    this.toqueX = toque.clientX;
    this.toqueY = toque.clientY;
    this.gesto = 'indeciso';
  }

  protected alArrastrarCajon(evento: TouchEvent): void {
    if (this.gesto === 'ignorado') return;
    if (!this.esMovil() || !this.sidebarExpanded()) return;

    const toque = evento.touches[0];
    const dx = this.toqueX - toque.clientX;
    const dy = Math.abs(this.toqueY - toque.clientY);

    if (this.gesto === 'indeciso') {
      /* Nada se mueve hasta saber hacia dónde va el dedo: ni se roba el scroll
         vertical de la lista ni se desplaza el cajón por un temblor. */
      if (Math.abs(dx) < 8 && dy < 8) return;
      /* Solo es cierre si va a la izquierda Y domina la horizontal. */
      this.gesto = dx > 0 && dx > dy ? 'cerrando' : 'ignorado';
      if (this.gesto === 'ignorado') return;
    }

    this.desplazamientoCajon.set(Math.min(Math.max(dx, 0), LayoutComponent.ANCHO_CAJON));
  }

  protected alSoltarCajon(): void {
    const dx = this.desplazamientoCajon();
    this.desplazamientoCajon.set(null);
    this.gesto = 'indeciso';
    if (dx !== null && dx >= LayoutComponent.UMBRAL_CIERRE) {
      this.sidebarExpanded.set(false);
    }
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

  logout(): void {
    this.authService.logout();
    this.router.navigate(['/auth/login']);
  }
}
