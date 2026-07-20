export type EstadoComision = 'PENDIENTE' | 'PAGADA';

/** Respuesta de GET /comisiones. Prisma serializa Decimal como string. */
export interface Comision {
  readonly id: string;
  readonly monto: string;
  readonly estado: EstadoComision;
  readonly pagadaEn: string | null;
  readonly createdAt: string;
  readonly agente: { id: string; nombre: string };
  readonly venta: { id: string; producto: string; monto: string; createdAt: string };
}
