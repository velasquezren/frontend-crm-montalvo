import { CategoriaCliente, OrigenLead } from '../../core/api/db-enums';

/** Espejo de `PERIODOS_KPI` (backend: modules/kpis/dto/query-kpis.dto.ts). */
export type PeriodoKpi = 'MES' | 'MES_ANTERIOR' | 'TRES_MESES';

export interface ContactoVisible {
  readonly nombre: string;
  readonly telefono: string | null;
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
    /** Las Gold entre ellas: el mismo número que «Gold» en «Sin responder». */
    readonly chatsGoldSinResponder: number;
    readonly leadsHoy: number;
    /** Pidieron una persona y nadie la tomó: «Atención» del inbox, en espera. Opcional: un backend anterior no lo manda. */
    readonly esperanPersona?: number;
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

/**
 * Respuesta de GET /kpis/detalle: lo que el Dashboard pinta bajo el pliegue,
 * pedido aparte para que lo de arriba no lo espere. Mismo alcance por rol.
 */
export interface KpiDetalle {
  /** Leads del periodo por cuánto esperaron su primera respuesta humana. */
  readonly primeraRespuesta: {
    readonly menos15: number;
    readonly menosHora: number;
    readonly menos4Horas: number;
    readonly menosDia: number;
    readonly masDia: number;
    readonly sinRespuesta: number;
  };
  /** Leads por día (0 = lunes) y hora de La Paz; solo las celdas con alguno. */
  readonly porHora: ReadonlyArray<{ readonly dia: number; readonly hora: number; readonly leads: number }>;
  /** Chats con un mensaje de la paciente en el periodo, por línea. */
  readonly chatsPorLinea: ReadonlyArray<{ readonly lineaId: string; readonly linea: string; readonly chats: number }>;
  /** Pacientes que escribieron en el periodo, por categoría. */
  readonly pacientesPorCategoria: ReadonlyArray<{ readonly categoria: CategoriaCliente; readonly pacientes: number }>;
  /** Turnos del asistente por resultado; `null` para una agente o si no hubo ninguno. */
  readonly asistente: Partial<Record<'SUGIRIO' | 'RESPONDIO' | 'DERIVO' | 'OMITIDO' | 'FALLO', number>> | null;
}

/** Los tramos de la primera respuesta, de lo mejor a lo peor, con su etiqueta. */
export const TRAMOS_RESPUESTA: ReadonlyArray<{ readonly clave: keyof KpiDetalle['primeraRespuesta']; readonly etiqueta: string }> = [
  { clave: 'menos15', etiqueta: 'Menos de 15 min' },
  { clave: 'menosHora', etiqueta: '15 a 60 min' },
  { clave: 'menos4Horas', etiqueta: '1 a 4 h' },
  { clave: 'menosDia', etiqueta: '4 a 24 h' },
  { clave: 'masDia', etiqueta: 'Más de un día' },
  { clave: 'sinRespuesta', etiqueta: 'Sin respuesta' },
];

/** Bandas de dos horas del mapa de calor: 0–2, 2–4… 22–24. */
export const BANDAS_HORA = 12;
export const DIAS_SEMANA_CORTOS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'] as const;

/**
 * El mapa de calor: 7 días × 12 bandas de dos horas, con la intensidad (0 a 1)
 * de cada celda respecto de la más cargada, y la celda pico. Puro y probado.
 */
export function mapaDeCalor(porHora: KpiDetalle['porHora']): {
  readonly celdas: ReadonlyArray<ReadonlyArray<{ readonly leads: number; readonly intensidad: number }>>;
  readonly max: number;
  readonly pico: { readonly dia: number; readonly banda: number; readonly leads: number } | null;
} {
  const conteo = Array.from({ length: 7 }, () => Array<number>(BANDAS_HORA).fill(0));
  for (const c of porHora) {
    if (c.dia < 0 || c.dia > 6 || c.hora < 0 || c.hora > 23) continue;
    conteo[c.dia][Math.floor(c.hora / 2)] += c.leads;
  }
  let max = 0;
  let pico: { dia: number; banda: number; leads: number } | null = null;
  conteo.forEach((fila, dia) => fila.forEach((leads, banda) => {
    if (leads > max) { max = leads; pico = { dia, banda, leads }; }
  }));
  return {
    celdas: conteo.map(fila => fila.map(leads => ({ leads, intensidad: max > 0 ? leads / max : 0 }))),
    max,
    pico,
  };
}

/** «18 a 20 h». */
export function etiquetaDeBanda(banda: number): string {
  return `${banda * 2} a ${banda * 2 + 2} h`;
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

/**
 * Cuánto lleva un periodo que empezó hace poco («hace 3 horas», «hace 1 día»),
 * o null si ya pasaron `dias`. El Dashboard lo usa para avisar que «Este mes»
 * todavía tiene pocos datos: el día 1 a las 00:09 salía todo en cero y se leyó
 * como que no traía datos.
 */
export function inicioReciente(desde: string, ahora: Date, dias: number): string | null {
  const horas = Math.floor((ahora.getTime() - new Date(desde).getTime()) / 3_600_000);
  if (horas < 0 || horas >= dias * 24) return null;
  if (horas < 1) return 'hace menos de una hora';
  if (horas < 24) return `hace ${horas} ${horas === 1 ? 'hora' : 'horas'}`;
  const d = Math.floor(horas / 24);
  return `hace ${d} ${d === 1 ? 'día' : 'días'}`;
}
