import { IconName } from '../icon/icon.component';

/**
 * Navegación principal del CRM
 * Ref: CRM_MANIFESTO.md §1.2 (Dominios: dashboard, clientes, leads, conversaciones, ventas, comisiones)
 * `soloAdmin` oculta el ítem a los agentes (el backend además lo bloquea con @Roles).
 */
export interface NavItem {
  readonly path: string;
  readonly label: string;
  readonly icon: IconName;
  readonly soloAdmin?: boolean;
  /** Más restrictivo que `soloAdmin`: ni siquiera un ADMIN lo ve. */
  readonly soloSuperAdmin?: boolean;
}

export const NAV_ITEMS: readonly NavItem[] = [
  { path: '/dashboard', label: 'Dashboard', icon: 'dashboard' },
  { path: '/clientes', label: 'Clientes', icon: 'users' },
  { path: '/leads', label: 'Leads', icon: 'user-plus' },
  { path: '/conversaciones', label: 'WhatsApp', icon: 'message-circle' },
  { path: '/ventas', label: 'Ventas', icon: 'shopping-bag' },
  { path: '/comisiones', label: 'Comisiones', icon: 'wallet' },
  { path: '/planilla-comisiones', label: 'Planilla', icon: 'pie-chart', soloAdmin: true },
  { path: '/agentes', label: 'Agentes', icon: 'shield', soloSuperAdmin: true },
];
