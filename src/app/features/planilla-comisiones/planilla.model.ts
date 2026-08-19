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

/** Foto de las reglas que produjeron una liquidación. */
export interface FotoConfiguracion {
  readonly calculadoEn: string;
  readonly tipoCambio: number;
  readonly parametros: Record<string, number>;
  readonly objetivos: ReadonlyArray<{
    tipo: string;
    planpaqMinimos: number;
    planninMinimos: number;
    montoMensualUsd: number;
    montoTrimestralUsd: number;
  }>;
  readonly tarifasServicio: ReadonlyArray<{ clasif: string; pctEmpresa: number; pctPropio: number }>;
  readonly tarifasPlan: ReadonlyArray<{ clave: string; pctEmpresa: number; pctPropio: number }>;
  readonly nivelesCirugia: ReadonlyArray<{
    nivel: number;
    montoDesde: number;
    montoHasta: number;
    pctEmpresa: number;
    pctPropio: number;
  }>;
}

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
  /**
   * Reglas con las que se liquidó este mes, congeladas al calcular.
   *
   * `null` en los periodos calculados antes de que esto existiera: no se puede
   * inventar qué reglas fueron, y la pantalla lo dice en vez de mostrar las de
   * hoy como si hubieran sido las suyas.
   */
  configuracionUsada: FotoConfiguracion | null;
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
  codOrigen?: string | null;
  codItem?: string | null;
  fecha: string | null;
  modulo: string | null;
  detalle: string;
  paciente: string | null;
  vendedoraNombre: string | null;
  captacion: string | null;
  precio: string;
  /**
   * Lo que la paciente pagó de su plan este mes, si la fila es un cobro de plan.
   *
   * **No entra en el cálculo.** La base es siempre `precio × 0,87`, pague la
   * paciente el total, un anticipo o nada: el plan comisiona una sola vez, por
   * su precio entero, el mes en que se vendió. Viaja hasta la tabla solo como
   * información — un plan se cobra a lo largo de varios meses y administración
   * necesita ver por dónde va, pero eso no mueve la comisión.
   */
  anticipoPlan?: string | null;
  /**
   * Estado del plan en FileMaker (APROBADO / TERMINADO). Solo en filas de plan.
   *
   * **No excluye ni cambia la comisión** — antes sí, y se retiró. Y **no dice si
   * la paciente pagó**: en enero hay TERMINADOS con el 25 % pagado y APROBADOS
   * con el 100 %. Está para que administración vea en qué punto va cada plan.
   */
  estadoPlan?: string | null;
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
   * Solo en planes. `null` = lo elige el sistema (los últimos vendidos, por
   * correlativo de registro); `true`/`false` = administración lo decidió a mano
   * y su decisión manda.
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
  /** Llega como TEXTO: es un `Decimal` de Prisma y así se serializa a JSON. */
  sueldoBase: string;
  activa: boolean;
  configurada: boolean;
  agente: AgenteDelCrm | null;
}

/**
 * Lo que acepta `PATCH /planilla-comisiones/vendedoras/:id`.
 *
 * **No es `Partial<Vendedora>`**, y la diferencia importa: al leer, `sueldoBase`
 * llega como texto, pero el DTO del backend lo valida con `@IsNumber()`. Enviarlo
 * como texto —que es lo que salía de reusar el tipo de lectura— hacía que el
 * PATCH respondiera 400 y el sueldo no se guardara nunca, sin que la interfaz lo
 * mostrara. Un tipo propio para la escritura hace que el compilador lo impida.
 */
export interface CambiosVendedora {
  nombre?: string;
  tipo?: TipoVendedora;
  area?: AreaVendedora;
  sueldoBase?: number;
  activa?: boolean;
  configurada?: boolean;
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

/** Los dos tipos de plan que tienen objetivo propio. */
export type TipoPlan = 'PLANPAQ' | 'PLANNIN';

/** Los planes de una vendedora de un tipo, con su objetivo y su cupo resueltos. */
export interface GrupoPlanes {
  readonly clave: string;
  readonly vendedoraId: string;
  readonly vendedoraNombre: string;
  readonly tipo: TipoPlan;
  /** Cuántos hay que superar para que empiecen a comisionar. */
  readonly objetivo: number;
  /** Cuántos comisionan: vendidos − objetivo. */
  readonly cupo: number;
  planes: VentaImportada[];
  elegidos?: ReadonlySet<string>;
}

