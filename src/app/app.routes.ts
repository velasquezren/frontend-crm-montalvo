import { Routes } from '@angular/router';

import { authGuard } from './core/auth/auth.guard';

/**
 * Rutas del CRM — Clínica Montalvo
 * Ref: CRM_MANIFESTO.md §2.7 — Lazy loading, guards funcionales
 *
 * Arquitectura:
 *   /auth/login  → LoginPage (pantalla completa, sin layout)
 *   /            → LayoutComponent [authGuard] → children por dominio
 */

/* Loader temporal — se eliminará cuando cada feature tenga su propia page */
const loadPlaceholder = () =>
  import('./features/dashboard/dashboard.page').then(m => m.DashboardPage);

export const routes: Routes = [
  /* ── Auth (sin layout, pantalla completa) ──────────────────────── */
  {
    path: 'auth',
    children: [
      {
        path: 'login',
        loadComponent: () =>
          import('./features/auth/login.page').then(m => m.LoginPage),
      },
      { path: '', redirectTo: 'login', pathMatch: 'full' },
    ],
  },

  /* ── CRM (con LayoutComponent como wrapper + authGuard) ────────── */
  {
    path: '',
    loadComponent: () =>
      import('./shared/components/layout/layout.component').then(
        m => m.LayoutComponent,
      ),
    canActivate: [authGuard],
    children: [
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
      {
        path: 'dashboard',
        loadComponent: () =>
          import('./features/dashboard/dashboard.page').then(
            m => m.DashboardPage,
          ),
      },
      /* Rutas placeholder — serán reemplazadas por feature pages */
      { path: 'clientes', loadComponent: loadPlaceholder },
      { path: 'leads', loadComponent: loadPlaceholder },
      { path: 'conversaciones', loadComponent: loadPlaceholder },
      { path: 'ventas', loadComponent: loadPlaceholder },
      { path: 'comisiones', loadComponent: loadPlaceholder },
    ],
  },
];
