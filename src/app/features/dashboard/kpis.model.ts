/**
 * Respuesta de GET /kpis/resumen (RF-16/RF-17/RF-18).
 * Para un AGENTE el backend acota ventas y comisiones a las suyas;
 * un ADMIN recibe los totales globales.
 */
export interface KpiResumen {
  ventas: {
    total: number;
    cantidad: number;
    porAgente: Array<{ agenteId: string; agente: string; cantidad: number; monto: number }>;
  };
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
}
