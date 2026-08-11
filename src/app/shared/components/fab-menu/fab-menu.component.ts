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
 * FAB Menu Instantáneo (0 ms) — Menú desplegable sin retardos ni animaciones lentas.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-fab-menu',
  imports: [RouterLink, IconComponent],
  template: `
    @if (visible()) {
      <!-- ── Fondo oscuro directo ────────────────────────────── -->
      @if (abierto()) {
        <div class="fab-overlay" (click)="cerrar()" aria-hidden="true"></div>
      }

      <div class="fab-container">

        <!-- ── Lista de ítems inmediata ────────────────────────── -->
        @if (abierto()) {
          <ul class="fab-list" role="menu">
            @for (item of filteredItems(); track item.path) {
              <li class="fab-list-item">
                <a
                  [routerLink]="item.path"
                  role="menuitem"
                  class="fab-item"
                  (click)="cerrar()">
                  <span class="fab-item-label">{{ item.label }}</span>
                  <span
                    class="fab-item-icon"
                    [style.color]="item.accent || 'var(--color-primary)'">
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
          <app-icon name="plus" [size]="24" [strokeWidth]="2.5" />
        </button>

      </div>
    }
  `,
  styles: `
    .fab-overlay {
      position: fixed;
      inset: 0;
      z-index: 90;
      background: rgba(15, 23, 42, 0.25);
    }

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

    @media (max-width: 768px) {
      .fab-container {
        right: 1.25rem;
        bottom: calc(4.5rem + env(safe-area-inset-bottom, 0px));
      }
    }

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
      display: flex;
      align-items: center;
    }

    .fab-item {
      display: flex;
      align-items: center;
      gap: 0.625rem;
      text-decoration: none;
    }

    .fab-item-label {
      background: #ffffff;
      color: #1f2937;
      font-size: 0.8125rem;
      font-weight: 600;
      padding: 0.5rem 0.875rem;
      border-radius: 12px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
      white-space: nowrap;
    }

    .fab-item:hover .fab-item-label {
      background: #f8f9fa;
    }

    .fab-item-icon {
      width: 2.75rem;
      height: 2.75rem;
      border-radius: 50%;
      background: #ffffff;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    }

    .fab-item:hover .fab-item-icon {
      background: #eaf7f5;
    }

    .fab-main {
      width: 3.5rem;
      height: 3.5rem;
      border-radius: 50%;
      background: #006156;
      color: #ffffff;
      display: flex;
      align-items: center;
      justify-content: center;
      border: none;
      cursor: pointer;
      box-shadow: 0 4px 14px rgba(0, 97, 86, 0.4);
    }

    .fab-main:hover {
      background: #004d44;
    }

    .fab-main--open {
      transform: rotate(45deg);
      background: #1f2937;
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
