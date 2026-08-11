import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { filter, map } from 'rxjs';

import { AuthService } from '../../../core/auth/auth.service';
import { cubreRol } from '../../../core/auth/roles';
import { RolUsuario } from '../../../core/auth/user.model';
import { IconComponent, IconName } from '../icon/icon.component';

export interface FabMenuItem {
  readonly icon: IconName;
  readonly label: string;
  readonly path: string;
  /** Nivel mínimo para ver la acción; sin él, la ve todo el mundo. */
  readonly rolMinimo?: RolUsuario;
  /** Color de acento del ícono. Fallback: --color-primary */
  readonly accent?: string;
}

/**
 * FAB Menu Ultra-Optimizado (60 FPS) — Speed-dial flotante ultra fluido
 * con aceleración por hardware (GPU), aislamiento de layout y animaciones de resorte.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-fab-menu',
  imports: [RouterLink, IconComponent],
  template: `
    @if (visible()) {
      <!-- ── Overlay con blur acelerado ──────────────────────── -->
      @if (abierto()) {
        <div class="fab-overlay" (click)="cerrar()" aria-hidden="true"></div>
      }

      <div class="fab-container" [class.fab-container--open]="abierto()">

        <!-- ── Menú de ítems ──────────────────────────────────── -->
        @if (abierto()) {
          <ul class="fab-list" role="menu">
            @for (item of filteredItems(); track item.path; let i = $index) {
              <li
                class="fab-list-item"
                [style.--delay]="(filteredItems().length - 1 - i) * 35 + 'ms'">
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
       OVERLAY — Glassmorphism con Aceleración por GPU
       ═══════════════════════════════════════════════════════════ */
    .fab-overlay {
      position: fixed;
      inset: 0;
      z-index: 90;
      background: rgba(15, 23, 42, 0.22);
      backdrop-filter: blur(4px);
      -webkit-backdrop-filter: blur(4px);
      transform: translateZ(0);
      will-change: opacity;
      animation: fab-overlay-in 0.18s cubic-bezier(0, 0, 0.2, 1) both;
    }

    @keyframes fab-overlay-in {
      from { opacity: 0; }
      to   { opacity: 1; }
    }

    /* ═══════════════════════════════════════════════════════════
       CONTENEDOR — Aislamiento de Layout & Capa GPU
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
      contain: layout style;
      transform: translateZ(0);
    }

    @media (max-width: 768px) {
      .fab-container {
        right: 1.25rem;
        bottom: calc(4.5rem + env(safe-area-inset-bottom, 0px));
      }
    }

    /* ═══════════════════════════════════════════════════════════
       LISTA DE ITEMS — Spring Animation Optimizada
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
      will-change: transform, opacity;
      transform: translateZ(0);
      animation: fab-item-in 0.22s cubic-bezier(0.16, 1, 0.3, 1) both;
      animation-delay: var(--delay, 0ms);
    }

    @keyframes fab-item-in {
      from {
        opacity: 0;
        transform: translateY(12px) scale(0.88);
      }
      to {
        opacity: 1;
        transform: translateY(0) scale(1);
      }
    }

    /* ═══════════════════════════════════════════════════════════
       ITEM — Pill Label + Ícono con Transiciones Ultra Rápida
       ═══════════════════════════════════════════════════════════ */
    .fab-item {
      display: flex;
      align-items: center;
      gap: 0.625rem;
      text-decoration: none;
      will-change: transform;
      transition: transform 0.12s ease-out;
    }

    .fab-item:active {
      transform: scale(0.94);
    }

    .fab-item-label {
      background: #ffffff;
      color: #1f2937;
      font-size: 0.8125rem;
      font-weight: 600;
      padding: 0.5rem 0.875rem;
      border-radius: 12px;
      box-shadow:
        0 2px 8px rgba(0, 0, 0, 0.08),
        0 0 0 1px rgba(0, 0, 0, 0.04);
      white-space: nowrap;
      will-change: transform, box-shadow;
      transition: transform 0.15s ease-out, box-shadow 0.15s ease-out;
    }

    .fab-item:hover .fab-item-label {
      box-shadow:
        0 4px 14px rgba(0, 0, 0, 0.12),
        0 0 0 1px rgba(0, 0, 0, 0.06);
      transform: translateX(-3px);
    }

    .fab-item-icon {
      width: 2.75rem;
      height: 2.75rem;
      border-radius: 50%;
      background: #ffffff;
      color: var(--accent, #006156);
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow:
        0 2px 8px rgba(0, 0, 0, 0.08),
        0 0 0 1px rgba(0, 0, 0, 0.04);
      will-change: transform, background-color;
      transition: transform 0.15s ease-out, background-color 0.15s ease-out;
    }

    .fab-item:hover .fab-item-icon {
      background: #eaf7f5;
      transform: scale(1.06);
      box-shadow:
        0 4px 14px rgba(0, 97, 86, 0.2),
        0 0 0 1px rgba(0, 97, 86, 0.1);
    }

    /* ═══════════════════════════════════════════════════════════
       BOTÓN PRINCIPAL — Acelerado por GPU
       ═══════════════════════════════════════════════════════════ */
    .fab-main {
      position: relative;
      width: 3.5rem;
      height: 3.5rem;
      border-radius: 50%;
      background: linear-gradient(135deg, #006156 0%, #39ada3 100%);
      color: #ffffff;
      display: flex;
      align-items: center;
      justify-content: center;
      border: none;
      cursor: pointer;
      box-shadow:
        0 4px 14px rgba(0, 97, 86, 0.35),
        0 1px 3px rgba(0, 0, 0, 0.1);
      transform: translateZ(0);
      will-change: transform, background-color, box-shadow;
      transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.2s ease-out, background 0.2s ease;
    }

    .fab-main:hover {
      box-shadow:
        0 6px 20px rgba(0, 97, 86, 0.45),
        0 2px 6px rgba(0, 0, 0, 0.12);
      transform: scale(1.05) translateZ(0);
    }

    .fab-main:active {
      transform: scale(0.92) translateZ(0);
    }

    .fab-main--open {
      transform: rotate(45deg) translateZ(0);
      background: #1f2937;
      box-shadow:
        0 4px 14px rgba(0, 0, 0, 0.25),
        0 1px 3px rgba(0, 0, 0, 0.1);
    }

    .fab-main--open:hover {
      transform: rotate(45deg) scale(1.05) translateZ(0);
      box-shadow:
        0 6px 20px rgba(0, 0, 0, 0.3),
        0 2px 6px rgba(0, 0, 0, 0.15);
    }

    /* ═══════════════════════════════════════════════════════════
       PULSE RING — Animación de Baja Carga CPU/GPU
       ═══════════════════════════════════════════════════════════ */
    .fab-pulse-ring {
      position: absolute;
      inset: -4px;
      border-radius: 50%;
      border: 2px solid rgba(0, 97, 86, 0.4);
      transform: translateZ(0);
      will-change: transform, opacity;
      animation: fab-pulse 2.5s cubic-bezier(0.4, 0, 0.2, 1) infinite;
      pointer-events: none;
    }

    @keyframes fab-pulse {
      0% {
        transform: scale(1) translateZ(0);
        opacity: 0.6;
      }
      70% {
        transform: scale(1.32) translateZ(0);
        opacity: 0;
      }
      100% {
        transform: scale(1.32) translateZ(0);
        opacity: 0;
      }
    }

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

  /** Oculta las acciones que el rol actual no alcanza. */
  protected readonly filteredItems = computed(() => {
    const rol = this.authService.user()?.rol;
    return this.items().filter(item => !item.rolMinimo || cubreRol(rol, item.rolMinimo));
  });

  protected toggle(): void {
    this.abierto.update(v => !v);
  }

  protected cerrar(): void {
    this.abierto.set(false);
  }
}
