import {
  AreaVendedora,
  CanalVenta,
  ClasifComision,
  EstadoPeriodo,
  NivelPlan,
  TipoComision,
  TipoVendedora,
  UnidadNegocio,
} from '../../core/api/db-enums';

export type {
  AreaVendedora,
  CanalVenta,
  ClasifComision,
  EstadoPeriodo,
  NivelPlan,
  TipoComision,
  TipoVendedora,
  UnidadNegocio,
};

export interface PeriodoComision {
  id: string;
  anio: number;
  mes: number;
  tipoCambio: string;
  estado: EstadoPeriodo;
  archivoNombre: string | null;
  filasTotales: number;
  filasValidas: number;
  calculadoEn: string | null;
  createdAt: string;
  _count?: { ventas: number; resultados: number };
}

export interface ResumenImportacion {
  filasLeidas: number;
  filasVacias: number;
  filasComisionables: number;
  filasSinClasificar: number;
  vendedorasDetectadas: number;
  columnasAusentes: string[];
  ajustesConservados: number;
}

export interface RespuestaImportacion {
  periodo: PeriodoComision;
  resumen: ResumenImportacion;
}

export interface VentaImportada {
  id: string;
  fecha: string | null;
  modulo: string | null;
  detalle: string;
  paciente: string | null;
  vendedoraNombre: string | null;
  captacion: string | null;
  precio: string;
  ingresoNeto: string;
  canal: CanalVenta;
  unidadNegocio: UnidadNegocio;
  clasif: ClasifComision;
  tipo: TipoComision;
  nivel: NivelPlan | null;
  comisionable: boolean;
  motivoExclusion: string | null;
  requiereRevision: boolean;
  ajustadaManual: boolean;
  /**
   * Solo en planes. `null` = lo elige el sistema (base más baja primero);
   * `true`/`false` = administración lo decidió a mano y su decisión manda.
   */
  comisionaPlan: boolean | null;
  vendedora: { id: string; nombre: string; codigo: string } | null;
}

export interface Alertas {
  totales: {
    filasExcluidas: number;
    vendedorasSinConfigurar: number;
    filasSinVendedora: number;
    planesSinEstadoValido: number;
    filasSinClasificar: number;
  };
  motivosExclusion: { motivo: string; filas: number; montoAfectado: number }[];
  serviciosSinClasificar: {
    detalle: string;
    modulo: string | null;
    veces: number;
    montoAfectado: number;
  }[];
  vendedorasPendientes: { id: string; codigo: string; nombre: string }[];
}

export interface Vendedora {
  id: string;
  codigo: string;
  nombre: string;
  tipo: TipoVendedora;
  area: AreaVendedora;
  sueldoBase: string;
  activa: boolean;
  configurada: boolean;
  agente: AgenteDelCrm | null;
}

export interface AgenteDelCrm {
  id: string;
  nombre: string;
  email: string;
  codigo: string | null;
  activo: boolean;
}

export interface FilaConsolidado {
  vendedoraId: string;
  nombre: string;
  codigo: string;
  tipo: TipoVendedora;
  area: AreaVendedora;
  montoVendido: number;
  baseCalculo: number;
  planesVendidos: number;
  /** true = superó alguno de los dos objetivos y por eso generó comisión Tipo A. */
  cumpleObjetivoPlanes: boolean;
  planpaqVendidos: number;
  planpaqComisionables: number;
  planninVendidos: number;
  planninComisionables: number;
  acumuladoCirugias: number;
  nivelCirugia: number | null;
  comisionA: number;
  comisionB: number;
  comisionC: number;
  bonoJefatura: number;
  /** Parte del pote de jefatura que cobra cada persona del área de publicidad. */
  bonoPublicidad: number;
  bonoTrimestral: number;
  /** Los tres bonos ya sumados por el backend: las plantillas solo formatean. */
  totalBonos: number;
  totalUsd: number;
  totalBob: number;
  sueldoBase: number;
  totalGanado: number;
  pctComision: number;
}

export interface ReporteConsolidado {
  periodo: PeriodoComision;
  filas: FilaConsolidado[];
  totales: Record<string, number>;
}

export interface ResultadoCalculo {
  periodoId: string;
  vendedorasLiquidadas: number;
  totalComisionUsd: number;
  totalComisionBob: number;
}

/* ── Configuración ──────────────────────────────────────────────────── */

export interface TarifaPlan {
  id: string;
  clave: string;
  pctEmpresa: string;
  pctPropio: string;
}

export interface TarifaServicio {
  id: string;
  clasif: ClasifComision;
  pctEmpresa: string;
  pctPropio: string;
}

export interface NivelCirugia {
  id: string;
  nivel: number;
  montoDesde: string;
  montoHasta: string;
  pctEmpresa: string;
  pctPropio: string;
}

export interface TarifaRA {
  id: string;
  procedimiento: string;
  montoEmpresa: string;
  montoPropio: string;
  esPorcentaje: boolean;
}

export interface Objetivo {
  id: string;
  tipo: TipoVendedora;
  /** null = meta por defecto; con id = meta propia de ese mes. */
  periodoId: string | null;
  /** Paquetes de maternidad a SUPERAR (igualar no comisiona). */
  planpaqMinimos: number;
  /** Planes varios / niño sano. Objetivo independiente. */
  planninMinimos: number;
  montoMensualUsd: string;
  montoTrimestralUsd: string;
}

/**
 * Un valor de la columna `captacion` y el canal al que corresponde. Decide si
 * la venta paga tarifa propia (más alta) o de empresa.
 */
export interface MapeoCaptacion {
  valor: string;
  canal: CanalVenta;
}

export interface ReglaClasificacion {
  id: string;
  patron: string;
  exacto: boolean;
  modulo: string | null;
  clasif: ClasifComision;
  nivel: NivelPlan | null;
  unidadNegocio: UnidadNegocio | null;
  prioridad: number;
  activa: boolean;
  notas: string | null;
}

export interface ConfiguracionPlanilla {
  tarifasPlan: TarifaPlan[];
  tarifasServicio: TarifaServicio[];
  nivelesCirugia: NivelCirugia[];
  tarifasRA: TarifaRA[];
  objetivos: Objetivo[];
  parametros: { clave: string; valor: string }[];
  /** Qué valor de `captacion` del Excel cuenta como venta propia. */
  captacion: MapeoCaptacion[];
  reglas: ReglaClasificacion[];
}

/* ── Etiquetas para la vista (fuente única) ─────────────────────────── */

export const CLASIF_LABEL: Record<ClasifComision, string> = {
  PLANPAQ: 'Plan Maternidad',
  PLANNIN: 'Plan Varios',
  CIRUGIA: 'Cirugía',
  CONSULTA: 'Consulta',
  LAB: 'Laboratorio',
  ECOGRAFIA: 'Ecografía',
  OTROSS: 'Otros Servicios',
  CAMPANA: 'Campaña',
  PROMOCION: 'Promoción',
};

export const TIPO_LABEL: Record<TipoComision, string> = {
  A: 'Tipo A · Planes',
  B: 'Tipo B · Cirugías',
  C: 'Tipo C · Servicios',
};

export const ESTADO_PERIODO_LABEL: Record<EstadoPeriodo, string> = {
  BORRADOR: 'Borrador',
  CALCULADO: 'Calculado',
  CERRADO: 'Cerrado',
};

export const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
] as const;

/* ── Resumen anual (GET /planilla-comisiones/anual) ─────────────────────────
   Espejo de `ResumenAnualService` del backend. Es la única vista que cruza
   periodos: doce meses y cuatro trimestres por vendedora. */

export interface MesVendedora {
  readonly mes: number;
  /** Bruto en USD, tal como viene del Excel de FileMaker. */
  readonly montoVendido: number;
  readonly comisionUsd: number;
  readonly bonoTrimestralUsd: number;
  readonly totalBob: number;
  /** false = ese mes todavía no se importó. */
  readonly importado: boolean;
  /** false = importado pero sin liquidar; el vendido sí es fiable. */
  readonly liquidado: boolean;
}

export interface TrimestreVendedora {
  readonly trimestre: 1 | 2 | 3 | 4;
  readonly meses: readonly number[];
  readonly vendido: number;
  /** Promedio sobre los meses IMPORTADOS, no sobre 3 fijo. */
  readonly promedio: number;
  readonly mesesConDatos: number;
  readonly objetivoUsd: number;
  readonly cumple: boolean;
  readonly bonoUsd: number;
  readonly bonoBob: number;
}

export interface FilaAnual {
  readonly vendedoraId: string;
  readonly codigo: string;
  readonly nombre: string;
  readonly tipo: string;
  readonly area: string;
  readonly meses: readonly MesVendedora[];
  readonly trimestres: readonly TrimestreVendedora[];
  readonly totalVendido: number;
  readonly totalComisionUsd: number;
  readonly totalBonoTrimestralUsd: number;
  readonly totalBob: number;
}

export interface ResumenAnual {
  readonly anio: number;
  readonly filas: readonly FilaAnual[];
  readonly totalesPorMes: readonly number[];
}

/** Abreviaturas para las cabeceras de doce columnas. */
export const MESES_CORTOS = [
  'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
  'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic',
] as const;
