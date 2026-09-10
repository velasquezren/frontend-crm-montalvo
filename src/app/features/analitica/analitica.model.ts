/**
 * Informe mensual de comisiones — espejo de `/planilla-comisiones/:id/analitica`.
 *
 * Todo lo que hay aquí sale del Excel de FileMaker ya importado y clasificado.
 * La captación de leads NO vive en este dominio: eso es del panel principal
 * (Dashboard), que tiene su propia fuente y no se duplica aquí.
 */

import { EstadoPeriodo } from '../../core/api/db-enums';

/** Una porción del total (categoría, canal, módulo…), con su peso relativo. */
export interface Porcion {
  readonly clave: string;
  readonly etiqueta: string;
  readonly cantidad: number;
  readonly montoVendido: number;
  readonly baseCalculo: number;
  readonly pctMonto: number;
}

/** Fila de los rankings: servicios más vendidos, médicos que más facturan. */
export interface FilaRanking {
  readonly etiqueta: string;
  readonly cantidad: number;
  readonly montoVendido: number;
  readonly pctMonto: number;
}

export interface VentaDiaria {
  readonly dia: string;
  readonly cantidad: number;
  readonly montoVendido: number;
}

export interface ResumenAnalitica {
  readonly filasComisionables: number;
  readonly filasExcluidas: number;
  readonly montoVendido: number;
  readonly baseCalculo: number;
  /** Lo que se descuenta de impuestos antes de comisionar (precio − base). */
  readonly impuestosDescontados: number;
  readonly ticketPromedio: number;
  readonly ventaMayor: number;
  readonly pacientesUnicos: number;
  readonly serviciosDistintos: number;
  readonly tipoCambio: number;
  /* Liquidación: en cero mientras el periodo no se haya calculado. */
  readonly vendedorasLiquidadas: number;
  readonly comisionTipoAUsd: number;
  /**
   * Tipo A (RA) — el quinto cubo, y el que faltaba.
   *
   * `comisionTotalUsd` es `A + A(RA) + B + C + bonos`
   * (`calculo-comisiones.service.ts`, donde se recalculan los totales con los
   * bonos ya aplicados). El backend lo devuelve desde que se implementó el
   * cubo el 22/8/2026, pero esta interfaz solo declaraba cuatro sumandos: el
   * campo llegaba en el JSON y se caía aquí en silencio, así que las tarjetas
   * de «Comisión por tipo» sumaban MENOS que el KPI de arriba sin que nada lo
   * dijera. No es un cubo residual: es la escala `NivelTipoARA`, la hoja
   * "Tipo A (RA)" del Excel y su columna en el informe Word.
   */
  readonly comisionTipoARAUsd: number;
  readonly comisionTipoBUsd: number;
  readonly comisionTipoCUsd: number;
  readonly bonosUsd: number;
  readonly comisionTotalUsd: number;
  readonly comisionTotalBob: number;
}

export interface AnaliticaPeriodo {
  readonly periodo: {
    readonly id: string;
    readonly anio: number;
    readonly mes: number;
    /* Del enum generado, NO una unión a mano: la de antes decía
       `'BORRADOR' | 'CALCULADO' | 'CERRADO'` y se había quedado sin
       `EN_REVISION` ni `PAGADO` desde que el ciclo de vida pasó de tres
       estados a cinco. El compilador daba por imposibles dos valores que el
       backend manda todos los meses. */
    readonly estado: EstadoPeriodo;
    readonly archivoNombre: string | null;
    readonly filasTotales: number;
  };
  readonly resumen: ResumenAnalitica;
  readonly porClasificacion: readonly Porcion[];
  readonly porCanal: readonly Porcion[];
  readonly porModulo: readonly Porcion[];
  readonly porUnidadNegocio: readonly Porcion[];
  readonly porNivelPlan: readonly Porcion[];
  readonly topServicios: readonly FilaRanking[];
  readonly topMedicos: readonly FilaRanking[];
  readonly porDia: readonly VentaDiaria[];
}
