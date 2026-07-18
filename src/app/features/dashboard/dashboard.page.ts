import { Component, signal } from '@angular/core';

/**
 * Dashboard — Panel de KPIs y métricas
 * Ref: CRM_MANIFESTO.md §1.2 (Dominio: kpis/dashboard)
 *
 * Placeholder visual para verificar que el layout y <router-outlet>
 * funcionan correctamente. Se reemplazará con datos reales del backend.
 */
@Component({
  selector: 'app-dashboard',
  template: `
    <div>
      <h1 class="text-2xl font-bold text-text-dark tracking-tight">Dashboard</h1>
      <p class="text-text-muted mt-1 text-sm">
        Panel de KPIs y métricas — Clínica Montalvo
      </p>

      <!-- KPI Cards placeholder — §3.2: rounded-2xl (16px), shadow-subtle -->
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mt-8">
        @for (card of cards(); track card.label) {
          <div class="bg-white rounded-2xl shadow-subtle p-6 transition-shadow duration-200
                      hover:shadow-lg">
            <p class="text-sm text-text-muted font-medium">{{ card.label }}</p>
            <p class="text-2xl font-bold text-text-dark mt-2">{{ card.value }}</p>
            <p class="text-xs text-secondary mt-1">{{ card.trend }}</p>
          </div>
        }
      </div>
    </div>
  `,
})
export class DashboardPage {
  protected readonly cards = signal([
    { label: 'Leads Hoy', value: '—', trend: 'Pendiente de conexión' },
    { label: 'Citas Programadas', value: '—', trend: 'Pendiente de conexión' },
    { label: 'Ventas del Mes', value: '—', trend: 'Pendiente de conexión' },
    { label: 'Tasa de Conversión', value: '—', trend: 'Pendiente de conexión' },
  ]);
}
