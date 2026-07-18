/**
 * Navegación principal del CRM — Clínica Montalvo
 * Ref: CRM_MANIFESTO.md §1.2 (Dominios: dashboard, clientes, leads, conversaciones, ventas, comisiones)
 */

export interface NavItem {
  readonly path: string;
  readonly label: string;
  readonly icon: string;
}

export const NAV_ITEMS: readonly NavItem[] = [
  { path: '/dashboard', label: 'Dashboard', icon: 'dashboard' },
  { path: '/clientes', label: 'Clientes', icon: 'users' },
  { path: '/leads', label: 'Leads', icon: 'user-plus' },
  { path: '/conversaciones', label: 'WhatsApp', icon: 'message-circle' },
  { path: '/ventas', label: 'Ventas', icon: 'shopping-bag' },
  { path: '/comisiones', label: 'Comisiones', icon: 'wallet' },
];
