import { Routes } from '@angular/router';

import { authGuard } from './core/auth/auth.guard';
import { exigeRol } from './core/auth/roles';

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
        /* Consume KPIs globales y la planilla de comisiones (endpoints de admin):
           sin este guard un agente veria la pagina cargar y fallar con 403. */
        path: 'servicios',
        canActivate: [exigeRol('ADMIN')],
        loadComponent: () =>
          import('./features/servicios/servicios.page').then(m => m.ServiciosPage),
      },
      {
        path: 'reportes',
        canActivate: [exigeRol('ADMIN')],
        loadComponent: () =>
          import('./features/reportes/reportes.page').then(
            m => m.ReportesPage,
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
        canActivate: [exigeRol('ADMIN')],
        loadComponent: () =>
          import('./features/planilla-comisiones/planilla-comisiones.page').then(
            m => m.PlanillaComisionesPage,
          ),
      },
      {
        /* La única vista que cruza periodos: doce meses y cuatro trimestres por
           vendedora. Mismo rol que la planilla — son datos de remuneración. */
        path: 'comisiones-anual',
        canActivate: [exigeRol('ADMIN')],
        loadComponent: () =>
          import('./features/planilla-comisiones/resumen-anual.page').then(
            m => m.ResumenAnualPage,
          ),
      },
      {
        /* Gestión de agentes: solo super admin — es donde se asignan los códigos
           de empresa de los que depende toda la planilla de comisiones. */
        path: 'usuarios',
        canActivate: [exigeRol('SUPER_ADMIN')],
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
