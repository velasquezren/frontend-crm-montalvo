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
  /** Paquetes de maternidad a SUPERAR (igualar no comisiona). */
  planpaqMinimos: number;
  /** Planes varios / niño sano. Objetivo independiente. */
  planninMinimos: number;
  montoMensualUsd: string;
  montoTrimestralUsd: string;
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
