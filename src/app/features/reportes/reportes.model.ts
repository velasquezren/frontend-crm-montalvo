/**
 * Interfaces y tipos para el módulo de Reportes Generales y Analítica Visual.
 */

export interface MetricaReporte {
  readonly label: string;
  readonly valor: string;
  readonly subtexto: string;
  readonly cambioPct?: number;
  readonly icon: string;
  readonly colorClass?: string;
}

export interface ReporteMesHistorico {
  readonly periodoId: string;
  readonly mesNombre: string;
  readonly anio: number;
  readonly totalVendido: number;
  readonly totalComisionesUsd: number;
  readonly totalComisionesBs: number;
  readonly vendedorasActivas: number;
  readonly filasValidas: number;
  readonly estado: 'BORRADOR' | 'CALCULADO' | 'CERRADO';
}

export interface DesgloseCanalReporte {
  readonly origen: string;
  readonly nombre: string;
  readonly leads: number;
  readonly convertidos: number;
  readonly tasaConversion: number;
  readonly color: string;
}

export interface RendimientoVendedora {
  readonly id: string;
  readonly nombre: string;
  readonly codigo: string;
  readonly tipo: string;
  readonly area: string;
  readonly montoVendido: number;
  readonly comisionUsd: number;
  readonly comisionBob: number;
  readonly planesVendidos: number;
  readonly sueldoBase: number;
  readonly totalGanado: number;
}
