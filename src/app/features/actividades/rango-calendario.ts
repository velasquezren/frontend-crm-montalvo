import { Temporal } from 'temporal-polyfill';

/**
 * La ventana que el calendario tiene a la vista, lista para `GET /actividades`.
 *
 * Los dos extremos son **instantes UTC en ISO 8601** y los dos son
 * **inclusivos**, porque así los usa el backend:
 * `fechaProgramada: { gte: desde, lte: hasta }` (`actividades.service.ts`).
 * Cambiar esa semántica aquí sin mirar allá deja fuera el primer o el último
 * día del mes sin que nada falle.
 */
export interface RangoCalendario {
  /** Primer milisegundo del primer día visible. Entra (`gte`). */
  desde: string;
  /** Último milisegundo del último día visible. Entra (`lte`). */
  hasta: string;
}

/**
 * Convierte el rango que publica Schedule-X en el contrato de arriba.
 *
 * **Se ensancha a días COMPLETOS a propósito.** Schedule-X entrega su `end` con
 * una inclusividad que es asunto suyo —tiene incluso un `setRangeEndMinusOneRange`
 * interno— y una celda del calendario es un día entero de todas formas. Apoyarse
 * en su hora exacta sería heredar un off-by-one que nadie ve hasta que una
 * actividad del día 30 a las 23:40 desaparece del mes.
 *
 * Todo el cálculo ocurre en la zona horaria del propio rango, que es la que
 * Schedule-X tiene configurada y la misma con la que se pintan los eventos
 * (`toZonedDateTimeISO(ZONA)`). Solo al final se pasa a instante, que es lo que
 * compara PostgreSQL: así el contrato no depende de dónde esté el navegador.
 *
 * `startOfDay()` y la aritmética de `Temporal` hacen el trabajo sucio —fin de
 * mes, cambio de año, días que no duran 24 h—: aquí no hay aritmética de
 * milisegundos que pueda equivocarse en marzo.
 */
export function rangoCalendarioDe(
  inicio: Temporal.ZonedDateTime,
  fin: Temporal.ZonedDateTime,
): RangoCalendario {
  const primerDia = inicio.startOfDay();
  const finDelUltimoDia = fin.startOfDay().add({ days: 1 }).subtract({ milliseconds: 1 });
  return {
    desde: primerDia.toInstant().toString(),
    hasta: finDelUltimoDia.toInstant().toString(),
  };
}

/** Dos rangos son el mismo si cubren los mismos instantes. */
export function mismoRango(a: RangoCalendario | null, b: RangoCalendario | null): boolean {
  if (a === null || b === null) return a === b;
  return a.desde === b.desde && a.hasta === b.hasta;
}
