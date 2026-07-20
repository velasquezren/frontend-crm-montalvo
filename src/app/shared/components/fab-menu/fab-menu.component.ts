import { Component, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { IconComponent, IconName } from '../icon/icon.component';

export interface FabMenuItem {
  readonly icon: IconName;
  readonly label: string;
  readonly path: string;
}

/**
 * Molécula FAB Menu — botón flotante de acciones rápidas (speed dial).
 * Único punto de entrada global para acciones frecuentes (ej. registro presencial),
 * evitando duplicar botones en topbar y páginas. Los ítems se amplían desde
 * el layout sin tocar este componente.
 * Ref: CRM_MANIFESTO.md §3.2 (píldoras/círculos, sombras sutiles, hover secondary).
 */
@Component({
  selector: 'app-fab-menu',
  imports: [RouterLink, IconComponent],
  template: `
    @if (abierto()) {
      <div class="fab-overlay" (click)="abierto.set(false)" aria-hidden="true"></div>
    }

    <div class="fab-container">
      @if (abierto()) {
        <ul class="fab-list" role="menu">
          @for (item of items(); track item.path; let i = $index) {
            <li [style.animation-delay.ms]="(items().length - 1 - i) * 45">
              <a
                [routerLink]="item.path"
                role="menuitem"
                class="fab-item"
                (click)="abierto.set(false)">
                <span class="fab-item-label">{{ item.label }}</span>
                <span class="fab-item-icon">
                  <app-icon [name]="item.icon" [size]="18" />
                </span>
              </a>
            </li>
          }
        </ul>
      }

      <button
        type="button"
        class="fab-main"
        [class.fab-main-open]="abierto()"
        [attr.aria-expanded]="abierto()"
        aria-label="Acciones rápidas"
        (click)="abierto.set(!abierto())">
        <app-icon name="plus" [size]="24" [strokeWidth]="2.5" />
      </button>
    </div>
  `,
  styles: `
    .fab-overlay {
      position: fixed;
      inset: 0;
      z-index: 40;
      background: rgba(31, 41, 55, 0.06);
    }

    .fab-container {
      position: fixed;
      right: 2rem;
      bottom: 2rem;
      z-index: 50;
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 0.875rem;
    }

    .fab-list {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 0.625rem;
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .fab-list li {
      animation: fab-in 0.18s ease-out both;
    }

    .fab-item {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      text-decoration: none;
    }

    .fab-item-label {
      background: white;
      color: var(--color-text-dark);
      font-size: 0.8125rem;
      font-weight: 500;
      padding: 0.5rem 0.875rem;
      border-radius: 999px;
      box-shadow: var(--shadow-subtle);
      white-space: nowrap;
    }

    .fab-item-icon {
      width: 2.75rem;
      height: 2.75rem;
      border-radius: 999px;
      background: white;
      color: var(--color-primary);
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: var(--shadow-subtle);
      transition: background-color 0.2s ease;
    }

    .fab-item:hover .fab-item-icon {
      background: var(--color-bg-light);
    }

    .fab-main {
      width: 3.5rem;
      height: 3.5rem;
      border-radius: 999px;
      background: var(--color-primary);
      color: white;
      display: flex;
      align-items: center;
      justify-content: center;
      border: none;
      cursor: pointer;
      box-shadow: var(--shadow-lifted);
      transition: transform 0.2s ease, background-color 0.2s ease;
    }

    .fab-main:hover {
      background: var(--color-secondary);
    }

    .fab-main-open {
      transform: rotate(45deg);
    }

    @keyframes fab-in {
      from {
        opacity: 0;
        transform: translateY(10px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }
  `,
})
export class FabMenuComponent {
  readonly items = input.required<readonly FabMenuItem[]>();

  protected readonly abierto = signal(false);
}
