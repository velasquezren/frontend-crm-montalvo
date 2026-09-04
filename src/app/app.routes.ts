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
        /* Planilla mensual de comisiones: importar, clasificar y liquidar */
        path: 'planilla',
        canActivate: [exigeRol('ADMIN')],
        loadComponent: () =>
          import('./features/planilla-comisiones/planilla-comisiones.page').then(
            m => m.PlanillaComisionesPage,
          ),
      },
      {
        /* Desempeño 360° individual por ejecutiva y metas: consume
           PlanillaComisionesService, que es @Roles('ADMIN') de clase en el
           backend (datos de remuneración de todo el equipo). Sin este guard
           un agente vería el ítem en el menú y cada petición le devolvería 403. */
        path: 'desempeno-agentes',
        canActivate: [exigeRol('ADMIN')],
        loadComponent: () =>
          import('./features/finanzas/components/desempeno-agentes/desempeno-agentes.component').then(
            m => m.DesempenoAgentesComponent,
          ),
      },
      {
        /* Analítica médica y de distribución clínica */
        path: 'analitica',
        canActivate: [exigeRol('ADMIN')],
        loadComponent: () =>
          import('./features/analitica/analitica.page').then(m => m.AnaliticaPage),
      },
      {
        /* Resumen anual consolidado: 12 meses y 4 trimestres */
        path: 'resumen-anual',
        canActivate: [exigeRol('ADMIN')],
        loadComponent: () =>
          import('./features/planilla-comisiones/resumen-anual.page').then(
            m => m.ResumenAnualPage,
          ),
      },
      {
        /* Hub unificado: Liquidación + Desempeño + Analítica + Anual en pestañas
           con retención de estado instantánea (ver crm-finanzas). Las cuatro
           rutas de abajo (planilla, desempeno-agentes, analitica, resumen-anual)
           se quedan activas aparte para no romper enlaces guardados; el menú
           lateral ahora solo lleva a este hub. */
        path: 'finanzas',
        canActivate: [exigeRol('ADMIN')],
        loadComponent: () =>
          import('./features/finanzas/finanzas.page').then(m => m.FinanzasPage),
      },
      {
        path: 'reportes',
        redirectTo: 'analitica',
        pathMatch: 'full',
      },
      {
        /* Redirección histórica hacia el hub unificado de finanzas */
        path: 'comisiones',
        redirectTo: 'finanzas',
        pathMatch: 'full',
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
        path: 'actividades',
        loadComponent: () =>
          import('./features/actividades/actividades.page').then(m => m.ActividadesPage),
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
        /* Redirección transparente por compatibilidad con marcadores existentes */
        path: 'planilla-comisiones',
        redirectTo: 'planilla',
        pathMatch: 'full',
      },
      {
        /* Redirección transparente por compatibilidad con marcadores existentes */
        path: 'comisiones-anual',
        redirectTo: 'resumen-anual',
        pathMatch: 'full',
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
