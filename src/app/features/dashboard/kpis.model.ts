export interface ActividadItem {
  id: string;
  tipo: 'VENTA' | 'LEAD';
  titulo: string;
  subtitulo: string;
  monto: number;
  fecha: string;
}

export interface TopServicio {
  producto: string;
  cantidad: number;
  monto: number;
}

export interface PulsoHoy {
  leadsHoy: number;
  ventasHoyMonto: number;
  ventasHoyCantidad: number;
  leadsNuevosSinAtender: number;
  conversacionesActivas: number;
}

/**
 * Respuesta de GET /kpis/resumen (RF-16/RF-17/RF-18).
 * Para un AGENTE el backend acota ventas y comisiones a las suyas;
 * un ADMIN recibe los totales globales.
 */
export interface KpiResumen {
  pulsoHoy?: PulsoHoy;
  ventas: {
    total: number;
    cantidad: number;
    ticketPromedio?: number;
    porAgente: Array<{ agenteId: string; agente: string; cantidad: number; monto: number }>;
  };
  topServicios?: TopServicio[];
  actividadReciente?: ActividadItem[];
  /** Conversión de leads a ventas por canal de origen (RF-17). */
  leadsPorOrigen: Array<{
    origen: string;
    cantidad: number;
    convertidos: number;
    tasaConversion: number;
  }>;
  clientesPorCategoria: Array<{ categoria: string; cantidad: number }>;
  comisiones: {
    pendiente: number;
    pagada: number;
  };
  funnel?: {
    conversacionesTotal: number;
    leadsContactados: number;
  };
}
