import { Routes } from '@angular/router';

import { adminGuard } from './core/auth/admin.guard';
import { authGuard } from './core/auth/auth.guard';
import { superAdminGuard } from './core/auth/super-admin.guard';

/**
 * Rutas del CRM
 * Ref: CRM_MANIFESTO.md §2.7 — Lazy loading, guards funcionales
 *
 * Arquitectura:
 *   /auth/login  → LoginPage (pantalla completa, sin layout)
 *   /            → LayoutComponent [authGuard] → children por dominio
 *   **           → NotFoundPage (pantalla completa, sin layout)
 */

export const routes: Routes = [
  { path: 'login', redirectTo: 'auth/login', pathMatch: 'full' },

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
      {
        path: 'clientes',
        loadComponent: () =>
          import('./features/clientes/clientes.page').then(m => m.ClientesPage),
      },
      {
        path: 'leads',
        loadComponent: () =>
          import('./features/leads/leads.page').then(m => m.LeadsPage),
      },
      {
        path: 'leads/registro-presencial',
        loadComponent: () =>
          import('./features/leads/registro-presencial/registro-presencial.page').then(
            m => m.RegistroPresencialPage,
          ),
      },
      {
        path: 'conversaciones',
        loadComponent: () =>
          import('./features/conversaciones/conversaciones.page').then(
            m => m.ConversacionesPage,
          ),
      },
      {
        path: 'ventas',
        loadComponent: () =>
          import('./features/ventas/ventas.page').then(m => m.VentasPage),
      },
      {
        path: 'comisiones',
        loadComponent: () =>
          import('./features/comisiones/comisiones.page').then(m => m.ComisionesPage),
      },
      {
        /* Planilla mensual de comisiones (Excel de FileMaker) — solo admin:
           son datos de remuneración de todo el equipo. */
        path: 'planilla-comisiones',
        canActivate: [adminGuard],
        loadComponent: () =>
          import('./features/planilla-comisiones/planilla-comisiones.page').then(
            m => m.PlanillaComisionesPage,
          ),
      },
      {
        /* Gestión de agentes: solo super admin — es donde se asignan los códigos
           de empresa de los que depende toda la planilla de comisiones. */
        path: 'agentes',
        canActivate: [superAdminGuard],
        loadComponent: () =>
          import('./features/agentes/agentes.page').then(m => m.AgentesPage),
      },
      {
        path: 'perfil',
        loadComponent: () =>
          import('./features/perfil/perfil.page').then(m => m.PerfilPage),
      },
    ],
  },

  /* ── Wildcard — cualquier ruta no reconocida ───────────────────── */
  {
    path: '**',
    loadComponent: () =>
      import('./features/not-found/not-found.page').then(m => m.NotFoundPage),
  },
];
