import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { filter, map } from 'rxjs';

import { AuthService } from '../../../core/auth/auth.service';
import { IconComponent, IconName } from '../icon/icon.component';

export interface FabMenuItem {
  readonly icon: IconName;
  readonly label: string;
  readonly path: string;
  readonly soloAdmin?: boolean;
  /** Color de acento del ícono (CSS custom property o hex). Fallback: --color-primary */
  readonly accent?: string;
}

/**
 * FAB Menu Premium — Speed-dial flotante con animaciones de resorte,
 * glassmorphism, indicador de pulso y posicionamiento adaptativo para
 * la bottom-bar de móvil.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-fab-menu',
  imports: [RouterLink, IconComponent],
  template: `
    @if (visible()) {
      <!-- ── Overlay con blur ──────────────────────────────── -->
      @if (abierto()) {
        <div class="fab-overlay" (click)="cerrar()" aria-hidden="true"></div>
      }

      <div class="fab-container" [class.fab-container--open]="abierto()">

        <!-- ── Menú de items ──────────────────────────────── -->
        @if (abierto()) {
          <ul class="fab-list" role="menu">
            @for (item of filteredItems(); track item.path; let i = $index) {
              <li
                class="fab-list-item"
                [style.--delay]="(filteredItems().length - 1 - i) * 50 + 'ms'">
                <a
                  [routerLink]="item.path"
                  role="menuitem"
                  class="fab-item"
                  (click)="cerrar()">
                  <span class="fab-item-label">{{ item.label }}</span>
                  <span
                    class="fab-item-icon"
                    [style.--accent]="item.accent || 'var(--color-primary)'">
                    <app-icon [name]="item.icon" [size]="18" />
                  </span>
                </a>
              </li>
            }
          </ul>
        }

        <!-- ── Botón principal ────────────────────────────── -->
        <button
          type="button"
          class="fab-main"
          [class.fab-main--open]="abierto()"
          [attr.aria-expanded]="abierto()"
          aria-label="Acciones rápidas"
          (click)="toggle()">
          <!-- Anillo de pulso cuando está cerrado -->
          @if (!abierto()) {
            <span class="fab-pulse-ring"></span>
          }
          <app-icon name="plus" [size]="24" [strokeWidth]="2.5" />
        </button>

      </div>
    }
  `,
  styles: `
    /* ═══════════════════════════════════════════════════════════
       OVERLAY — Glassmorphism backdrop
       ═══════════════════════════════════════════════════════════ */
    .fab-overlay {
      position: fixed;
      inset: 0;
      z-index: 90;
      background: rgba(15, 23, 42, 0.18);
      backdrop-filter: blur(6px);
      -webkit-backdrop-filter: blur(6px);
      animation: fab-overlay-in 0.25s ease-out both;
    }

    @keyframes fab-overlay-in {
      from { opacity: 0; }
      to   { opacity: 1; }
    }

    /* ═══════════════════════════════════════════════════════════
       CONTENEDOR — Posición fija adaptativa (desktop vs. móvil)
       ═══════════════════════════════════════════════════════════ */
    .fab-container {
      position: fixed;
      right: 1.75rem;
      bottom: 1.75rem;
      z-index: 100;
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 0.75rem;
    }

    /* En móvil: subir por encima de la bottom bar (3.8rem + safe area) */
    @media (max-width: 768px) {
      .fab-container {
        right: 1.25rem;
        bottom: calc(4.5rem + env(safe-area-inset-bottom, 0px));
      }
    }

    /* ═══════════════════════════════════════════════════════════
       LISTA DE ITEMS — Staggered spring animation
       ═══════════════════════════════════════════════════════════ */
    .fab-list {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 0.5rem;
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .fab-list-item {
      animation: fab-item-in 0.35s cubic-bezier(0.34, 1.56, 0.64, 1) both;
      animation-delay: var(--delay, 0ms);
    }

    @keyframes fab-item-in {
      from {
        opacity: 0;
        transform: translateY(16px) scale(0.8);
      }
      to {
        opacity: 1;
        transform: translateY(0) scale(1);
      }
    }

    /* ═══════════════════════════════════════════════════════════
       ITEM — Pill label + ícono circular con color de acento
       ═══════════════════════════════════════════════════════════ */
    .fab-item {
      display: flex;
      align-items: center;
      gap: 0.625rem;
      text-decoration: none;
      transition: transform 0.15s ease;
    }

    .fab-item:active {
      transform: scale(0.95);
    }

    .fab-item-label {
      background: white;
      color: var(--color-text-dark);
      font-size: 0.8125rem;
      font-weight: 600;
      padding: 0.5rem 0.875rem;
      border-radius: 12px;
      box-shadow:
        0 2px 8px rgba(0, 0, 0, 0.08),
        0 0 0 1px rgba(0, 0, 0, 0.04);
      white-space: nowrap;
      transition: all 0.2s ease;
    }

    .fab-item:hover .fab-item-label {
      box-shadow:
        0 4px 14px rgba(0, 0, 0, 0.12),
        0 0 0 1px rgba(0, 0, 0, 0.06);
      transform: translateX(-4px);
    }

    .fab-item-icon {
      width: 2.75rem;
      height: 2.75rem;
      border-radius: 50%;
      background: white;
      color: var(--accent, var(--color-primary));
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow:
        0 2px 8px rgba(0, 0, 0, 0.08),
        0 0 0 1px rgba(0, 0, 0, 0.04);
      transition: all 0.2s ease;
    }

    .fab-item:hover .fab-item-icon {
      background: color-mix(in srgb, var(--accent, var(--color-primary)) 10%, white);
      transform: scale(1.08);
      box-shadow:
        0 4px 16px color-mix(in srgb, var(--accent, var(--color-primary)) 25%, transparent),
        0 0 0 1px color-mix(in srgb, var(--accent, var(--color-primary)) 20%, transparent);
    }

    /* ═══════════════════════════════════════════════════════════
       BOTÓN PRINCIPAL — Gradiente premium + sombra de color
       ═══════════════════════════════════════════════════════════ */
    .fab-main {
      position: relative;
      width: 3.5rem;
      height: 3.5rem;
      border-radius: 50%;
      background: linear-gradient(
        135deg,
        var(--color-primary) 0%,
        color-mix(in srgb, var(--color-primary) 80%, var(--color-secondary)) 100%
      );
      color: white;
      display: flex;
      align-items: center;
      justify-content: center;
      border: none;
      cursor: pointer;
      box-shadow:
        0 4px 14px color-mix(in srgb, var(--color-primary) 35%, transparent),
        0 1px 3px rgba(0, 0, 0, 0.1);
      transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1),
                  box-shadow 0.3s ease;
    }

    .fab-main:hover {
      box-shadow:
        0 6px 22px color-mix(in srgb, var(--color-primary) 45%, transparent),
        0 2px 6px rgba(0, 0, 0, 0.12);
      transform: scale(1.06);
    }

    .fab-main:active {
      transform: scale(0.94);
    }

    .fab-main--open {
      transform: rotate(45deg);
      background: var(--color-text-dark);
      box-shadow:
        0 4px 14px rgba(0, 0, 0, 0.25),
        0 1px 3px rgba(0, 0, 0, 0.1);
    }

    .fab-main--open:hover {
      transform: rotate(45deg) scale(1.06);
      box-shadow:
        0 6px 22px rgba(0, 0, 0, 0.3),
        0 2px 6px rgba(0, 0, 0, 0.15);
    }

    /* ═══════════════════════════════════════════════════════════
       PULSE RING — Atrae atención cuando está cerrado (idle)
       ═══════════════════════════════════════════════════════════ */
    .fab-pulse-ring {
      position: absolute;
      inset: -4px;
      border-radius: 50%;
      border: 2px solid color-mix(in srgb, var(--color-primary) 40%, transparent);
      animation: fab-pulse 2.5s cubic-bezier(0.4, 0, 0.2, 1) infinite;
      pointer-events: none;
    }

    @keyframes fab-pulse {
      0% {
        transform: scale(1);
        opacity: 0.6;
      }
      70% {
        transform: scale(1.35);
        opacity: 0;
      }
      100% {
        transform: scale(1.35);
        opacity: 0;
      }
    }

    /* Reducir motion para accesibilidad */
    @media (prefers-reduced-motion: reduce) {
      .fab-pulse-ring {
        animation: none;
      }
      .fab-list-item {
        animation-duration: 0.01ms;
      }
    }
  `,
})
export class FabMenuComponent {
  readonly items = input.required<readonly FabMenuItem[]>();

  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);

  protected readonly abierto = signal(false);

  /** URL activa para auto-ocultamiento contextual. */
  protected readonly currentUrl = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map(e => e.urlAfterRedirects),
    ),
    { initialValue: this.router.url },
  );

  /** Ocultar en pantallas donde el FAB interfiere. */
  protected readonly visible = computed(() => {
    const url = this.currentUrl();
    return !url.includes('/conversaciones') && !url.includes('/login');
  });

  /** Filtrar items por rol del usuario. */
  protected readonly filteredItems = computed(() => {
    const isAdmin = this.authService.isAdmin();
    return this.items().filter(item => !item.soloAdmin || isAdmin);
  });

  protected toggle(): void {
    this.abierto.update(v => !v);
  }

  protected cerrar(): void {
    this.abierto.set(false);
  }
}
