import { OrigenLead } from '../../core/api/db-enums';

/** Espejo de `PERIODOS_KPI` (backend: modules/kpis/dto/query-kpis.dto.ts). */
export type PeriodoKpi = 'MES' | 'MES_ANTERIOR' | 'TRES_MESES';

export interface ContactoVisible {
  readonly nombre: string;
  readonly telefono: string;
}

export interface ActividadItem {
  readonly id: string;
  readonly tipo: 'VENTA' | 'LEAD';
  readonly cliente: ContactoVisible;
  /** Producto vendido (VENTA) u origen del lead (LEAD). */
  readonly detalle: string;
  readonly agente: string | null;
  readonly monto: number;
  readonly fecha: string;
}

export interface TopServicio {
  readonly producto: string;
  readonly cantidad: number;
  readonly monto: number;
}

export interface CanalKpi {
  readonly origen: OrigenLead;
  readonly captados: number;
  readonly respondidos: number;
  readonly convertidos: number;
  readonly medianaRespuestaMinutos: number | null;
}

export interface PuntoSerie {
  /** Día (o lunes de la semana) en el calendario de La Paz, `YYYY-MM-DD`. */
  readonly fecha: string;
  readonly captados: number;
  readonly respondidos: number;
  /** `null` si ese día nadie respondió: no es «0 minutos». */
  readonly medianaMinutos: number | null;
  readonly ventas: number;
}

/**
 * Respuesta de GET /kpis/resumen.
 *
 * «Respondido» NO es el estado del lead: es que una persona del equipo le
 * escribió al paciente después de que entró el lead (el acuse automático no
 * cuenta). El estado casi nunca se actualiza a mano y contarlo daba «632 por
 * contactar» cuando la mayoría ya tenía respuesta. Ver `kpis.service.ts`.
 *
 * Un AGENTE recibe sus ventas y sus leads más los del pool sin asignar.
 */
export interface KpiResumen {
  readonly periodo: {
    readonly clave: PeriodoKpi;
    readonly desde: string;
    readonly hasta: string;
    readonly granularidad: 'DIA' | 'SEMANA';
  };
  /** Lo que pide acción ya; no depende del periodo. */
  readonly ahora: {
    readonly chatsSinResponder: number;
    readonly leadsHoy: number;
  };
  readonly embudo: {
    readonly captados: number;
    readonly respondidos: number;
    readonly respondidosEnUnaHora: number;
    readonly convertidos: number;
    readonly medianaRespuestaMinutos: number | null;
    readonly anterior: {
      readonly captados: number;
      readonly respondidos: number;
      readonly convertidos: number;
      readonly medianaRespuestaMinutos: number | null;
    };
  };
  readonly serie: readonly PuntoSerie[];
  readonly canales: readonly CanalKpi[];
  readonly ventas: {
    readonly total: number;
    readonly cantidad: number;
    readonly ticketPromedio: number;
    readonly anterior: { readonly total: number; readonly cantidad: number };
    readonly porAgente: ReadonlyArray<{
      readonly agenteId: string;
      readonly agente: string;
      readonly foto: string | null;
      readonly cantidad: number;
      readonly monto: number;
    }>;
  };
  readonly topServicios: readonly TopServicio[];
  readonly actividadReciente: readonly ActividadItem[];
}

/** «2 h 4 min», «35 min», «3 d 2 h». Una mediana en minutos pelados no se lee. */
export function formatearEspera(minutos: number | null): string {
  if (minutos === null) return '—';
  if (minutos < 60) return `${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) {
    const resto = minutos % 60;
    return resto ? `${horas} h ${resto} min` : `${horas} h`;
  }
  const dias = Math.floor(horas / 24);
  const restoHoras = horas % 24;
  return restoHoras ? `${dias} d ${restoHoras} h` : `${dias} d`;
}

/** Porcentaje entero, o `null` si no hay base: «0 %» sobre cero sería inventar. */
export function porcentaje(parte: number, total: number): number | null {
  return total > 0 ? Math.round((parte / total) * 100) : null;
}

/**
 * Cambio contra el periodo anterior, dicho en palabras. `null` cuando no hay
 * con qué comparar: un «+100 %» contra cero no informa nada.
 */
export function variacion(
  actual: number,
  anterior: number,
): { texto: string; corto: string; sube: boolean } | null {
  if (anterior <= 0) return null;
  const cambio = Math.round(((actual - anterior) / anterior) * 100);
  if (cambio === 0) return { texto: 'igual que', corto: '=', sube: true };
  return {
    texto: `${Math.abs(cambio)} % ${cambio > 0 ? 'más' : 'menos'} que`,
    corto: `${cambio > 0 ? '+' : '−'}${Math.abs(cambio)} %`,
    sube: cambio > 0,
  };
}
