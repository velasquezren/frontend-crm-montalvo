/**
 * Informe mensual de comisiones — espejo de `/planilla-comisiones/:id/analitica`.
 *
 * Todo lo que hay aquí sale del Excel de FileMaker ya importado y clasificado.
 * La captación de leads NO vive en este dominio: eso es del panel principal
 * (Dashboard), que tiene su propia fuente y no se duplica aquí.
 */

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
    readonly estado: 'BORRADOR' | 'CALCULADO' | 'CERRADO';
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
