/*
 * El QR con que una línea cobra una promoción por WhatsApp (backend:
 * docs/pagos-promocion.md). Las reglas las aplica el servidor; aquí se dicen.
 */

export type EstadoCobro = 'LISTO' | 'APAGADO' | 'SIN_QR' | 'VENCIDO' | 'SIN_CONFIGURAR';

/** `GET /cobros/:lineaId`. */
export interface CobroEditable {
  readonly lineaId: string;
  readonly linea: { readonly nombre: string; readonly comercial: boolean };
  readonly cobro: {
    readonly activo: boolean;
    readonly banco: string;
    readonly titular: string;
    readonly instrucciones: string | null;
    readonly venceEl: string | null;
    /** Firmada y temporal: solo para la vista previa. */
    readonly imagenUrl: string | null;
  } | null;
  readonly estado: EstadoCobro;
  readonly actualizadoEn: string | null;
  readonly actualizadoPor: { readonly id: string; readonly nombre: string } | null;
}

/** Lo que se guarda (la imagen va aparte). */
export interface GuardarCobro {
  activo: boolean;
  banco: string;
  titular: string;
  instrucciones: string | null;
  venceEl: string | null;
}

/** Qué significa el estado para quien lo configura: si la tarjeta ofrecerá «Pagar ahora». */
export const ESTADO_COBRO: Readonly<Record<EstadoCobro, { texto: string; variante: 'success' | 'neutral' | 'critical' }>> = {
  LISTO: { texto: 'Activo: las promociones ofrecen «Pagar ahora»', variante: 'success' },
  APAGADO: { texto: 'Apagado: no se ofrece pagar por esta línea', variante: 'neutral' },
  SIN_QR: { texto: 'Falta la imagen del QR', variante: 'neutral' },
  VENCIDO: { texto: 'El QR venció: sube uno vigente', variante: 'critical' },
  SIN_CONFIGURAR: { texto: 'Sin configurar', variante: 'neutral' },
};
