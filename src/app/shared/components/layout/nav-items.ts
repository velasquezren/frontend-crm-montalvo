import { RolUsuario } from '../../../core/auth/user.model';
import { IconName } from '../icon/icon.component';

/**
 * Navegación principal del CRM — Estructurada en 3 módulos lógicos
 * Ref: CRM_MANIFESTO.md §1.2 & §3.2 (Diseño Atómico)
 */
export interface NavItem {
  readonly path: string;
  readonly label: string;
  readonly icon: IconName;
  readonly rolMinimo?: RolUsuario;
}

export interface NavGroup {
  readonly titulo: string;
  readonly items: readonly NavItem[];
}

export const NAV_GROUPS: readonly NavGroup[] = [
  {
    titulo: 'Atención & Pacientes',
    items: [
      { path: '/dashboard', label: 'Dashboard', icon: 'dashboard' },
      { path: '/conversaciones', label: 'WhatsApp', icon: 'message-circle' },
      { path: '/clientes', label: 'Clientes y Pacientes', icon: 'users' },
      { path: '/leads', label: 'Leads y Prospectos', icon: 'user-plus' },
      { path: '/actividades', label: 'Actividades', icon: 'calendar' },
    ],
  },
  {
    titulo: 'Ventas & Finanzas',
    items: [
      { path: '/ventas', label: 'Ventas', icon: 'shopping-bag' },
      /* Hub unificado: Liquidación, Desempeño, Analítica y Resumen Anual en
         pestañas (features/finanzas/finanzas.page.ts). Las cuatro rutas
         siguen vivas por separado para enlaces guardados, pero el menú ya
         solo lleva a este único ítem. */
      { path: '/finanzas', label: 'Finanzas & Comisiones', icon: 'wallet', rolMinimo: 'ADMIN' },
    ],
  },
  {
    titulo: 'Gestión & Clínica',
    items: [
      { path: '/servicios', label: 'Historial de Servicios', icon: 'activity', rolMinimo: 'ADMIN' },
      { path: '/usuarios', label: 'Usuarios y Accesos', icon: 'shield', rolMinimo: 'SUPER_ADMIN' },
    ],
  },
];

/* Compatibilidad plana para componentes o utilitarios que consulten la lista completa */
export const NAV_ITEMS: readonly NavItem[] = NAV_GROUPS.flatMap(g => g.items);
