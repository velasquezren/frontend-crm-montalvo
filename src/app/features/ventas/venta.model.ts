import { EstadoVenta } from '../../shared/models/estados.model';

export type { EstadoVenta };

export type MetodoPagoVenta = 'QR' | 'TRANSFERENCIA' | 'TARJETA' | 'EFECTIVO';

export interface ComprobanteSubido {
  readonly comprobanteKey: string;
  readonly comprobanteMime: string;
  readonly comprobanteNombre: string;
  readonly comprobanteUrl: string;
}

/** Respuesta de GET /ventas. Prisma serializa Decimal como string. */
export interface Venta {
  readonly id: string;
  readonly producto: string;
  readonly monto: string;
  readonly estado: EstadoVenta;
  readonly metodoPago?: string | null;
  readonly comprobante?: string | null;
  readonly comprobanteKey?: string | null;
  readonly comprobanteMime?: string | null;
  readonly comprobanteNombre?: string | null;
  readonly comprobanteUrl?: string | null;
  readonly medico?: string | null;
  readonly modulo?: string | null;
  readonly notas?: string | null;
  readonly cliente: { id: string; nombre: string; telefono: string; pac?: string | null };
  readonly agente: { id: string; nombre: string };
  readonly comision: { id: string; monto: string; estado: string } | null;
  readonly createdAt: string;
}

/** Un servicio que la clínica ya facturó, según el histórico de FileMaker. */
export interface ServicioCatalogo {
  readonly nombre: string;
  /** Módulo operativo de FileMaker (LABORATORIO, CONSULTA, PLANES, INTERNACION). */
  readonly modulo: string | null;
  readonly veces: number;
}

export interface MedicoCatalogo {
  readonly nombre: string;
  readonly veces: number;
}

/**
 * Catálogo real de la clínica, servido por `GET /ventas/catalogo`.
 *
 * Sustituye a las listas que estaban escritas a mano en la página: sugerían
 * ocho procedimientos de cirugía plástica cuando el 64% de lo que se factura es
 * laboratorio, así que la venta más frecuente no encontraba ninguna sugerencia.
 */
export interface CatalogoClinico {
  readonly servicios: readonly ServicioCatalogo[];
  readonly medicos: readonly MedicoCatalogo[];
  readonly modulos: readonly string[];
  readonly ventasAnalizadas: number;
}
