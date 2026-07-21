import { EstadoVenta } from '../../shared/models/estados.model';

export type { EstadoVenta };

/** Respuesta de GET /ventas. Prisma serializa Decimal como string. */
export interface Venta {
  readonly id: string;
  readonly producto: string;
  readonly monto: string;
  readonly estado: EstadoVenta;
  readonly cliente: { id: string; nombre: string; telefono: string };
  readonly agente: { id: string; nombre: string };
  readonly comision: { id: string; monto: string; estado: string } | null;
  readonly createdAt: string;
}
