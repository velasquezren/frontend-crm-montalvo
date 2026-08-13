import { RolUsuario } from '../../../core/auth/user.model';
import { IconName } from '../icon/icon.component';

/**
 * Navegación principal del CRM
 * Ref: CRM_MANIFESTO.md §1.2 (Dominios: dashboard, clientes, leads, conversaciones, ventas, comisiones)
 * `rolMinimo` oculta el ítem a quien no llegue a ese nivel; sin él, lo ve todo
 * el mundo. Es solo cosmético: el backend bloquea igual con @Roles.
 */
export interface NavItem {
  readonly path: string;
  readonly label: string;
  readonly icon: IconName;
  readonly rolMinimo?: RolUsuario;
}

export const NAV_ITEMS: readonly NavItem[] = [
  { path: '/dashboard', label: 'Dashboard', icon: 'dashboard' },
  { path: '/servicios', label: 'Historial Clínico', icon: 'activity', rolMinimo: 'ADMIN' },
  { path: '/reportes', label: 'Reportes y Gráficos', icon: 'bar-chart', rolMinimo: 'ADMIN' },
  { path: '/clientes', label: 'Clientes', icon: 'users' },
  { path: '/leads', label: 'Leads', icon: 'user-plus' },
  { path: '/conversaciones', label: 'WhatsApp', icon: 'message-circle' },
  { path: '/ventas', label: 'Ventas', icon: 'shopping-bag' },
  { path: '/comisiones', label: 'Comisiones', icon: 'wallet' },
  { path: '/planilla-comisiones', label: 'Planilla', icon: 'pie-chart', rolMinimo: 'ADMIN' },
  { path: '/comisiones-anual', label: 'Resumen Anual', icon: 'trending-up', rolMinimo: 'ADMIN' },
  { path: '/usuarios', label: 'Usuarios', icon: 'shield', rolMinimo: 'SUPER_ADMIN' },
];
