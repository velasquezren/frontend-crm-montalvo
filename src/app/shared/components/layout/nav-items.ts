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
    ],
  },
  {
    titulo: 'Ventas & Finanzas',
    items: [
      { path: '/ventas', label: 'Ventas', icon: 'shopping-bag' },
      { path: '/planilla', label: 'Planilla de Liquidación', icon: 'file-text', rolMinimo: 'ADMIN' },
      { path: '/desempeno-agentes', label: 'Desempeño de Agentes', icon: 'users' },
      { path: '/analitica', label: 'Analítica Médica', icon: 'bar-chart', rolMinimo: 'ADMIN' },
      { path: '/resumen-anual', label: 'Resumen Anual', icon: 'trending-up', rolMinimo: 'ADMIN' },
    ],
  },
  {
    titulo: 'Gestión & Clínica',
    items: [
      { path: '/servicios', label: 'Historial Clínico', icon: 'activity', rolMinimo: 'ADMIN' },
      { path: '/usuarios', label: 'Usuarios y Accesos', icon: 'shield', rolMinimo: 'SUPER_ADMIN' },
    ],
  },
];

/* Compatibilidad plana para componentes o utilitarios que consulten la lista completa */
export const NAV_ITEMS: readonly NavItem[] = NAV_GROUPS.flatMap(g => g.items);
