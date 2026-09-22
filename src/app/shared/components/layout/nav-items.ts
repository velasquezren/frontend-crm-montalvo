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
  /**
   * Roles concretos que también ven el ítem, además de los que cubren
   * `rolMinimo`. Existe porque la jerarquía es lineal y hay permisos que no lo
   * son: un asistente comparte rango con recepción y está por debajo de un
   * agente de ventas, pero es el único —junto con administración— que entrega
   * resultados. Usar solo cuando el rango no alcance; para todo lo demás,
   * `rolMinimo`.
   */
  readonly roles?: readonly RolUsuario[];
}

export interface NavGroup {
  readonly titulo: string;
  readonly items: readonly NavItem[];
}

export const NAV_GROUPS: readonly NavGroup[] = [
  {
    titulo: 'Atención & Pacientes',
    items: [
      { path: '/dashboard', label: 'Dashboard', icon: 'dashboard', rolMinimo: 'AGENTE' },
      { path: '/conversaciones', label: 'WhatsApp', icon: 'message-circle' },
      { path: '/clientes', label: 'Clientes y Pacientes', icon: 'users', rolMinimo: 'AGENTE' },
      { path: '/leads', label: 'Leads y Prospectos', icon: 'user-plus', rolMinimo: 'AGENTE' },
      { path: '/actividades', label: 'Actividades', icon: 'calendar', rolMinimo: 'RECEPCION' },
      {
        path: '/resultados',
        label: 'Entrega de Resultados',
        icon: 'file-text',
        rolMinimo: 'ADMIN',
        roles: ['ASISTENTE'],
      },
    ],
  },
  {
    titulo: 'Ventas & Finanzas',
    items: [
      { path: '/ventas', label: 'Ventas', icon: 'shopping-bag', rolMinimo: 'AGENTE' },
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
      { path: '/lineas-whatsapp', label: 'Líneas WhatsApp', icon: 'message-circle', rolMinimo: 'SUPER_ADMIN' },
      { path: '/usuarios', label: 'Usuarios y Accesos', icon: 'shield', rolMinimo: 'SUPER_ADMIN' },
    ],
  },
];
