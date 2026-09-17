import { Temporal } from 'temporal-polyfill';

/**
 * El día de calendario de la clínica, en el navegador.
 *
 * **Gemelo obligado de `common/fechas/zona-clinica.ts` del backend.** Los dos
 * responden la misma pregunta —¿dónde empieza «hoy»?— y tienen que responderla
 * igual, porque el KPI lo calcula el servidor y el filtro que sale al pulsarlo
 * lo calcula esta pantalla. Si divergen, la tarjeta dice «Hoy: 3» y la lista
 * enseña otras.
 *
 * Son dos archivos y no uno porque son dos runtimes distintos, no porque haya
 * dos criterios: la zona está escrita una vez en cada lado y las pruebas de los
 * dos fijan los MISMOS instantes exactos. Si algún día la clínica se muda, se
 * cambian los dos o las pruebas del otro lado caen.
 *
 * Antes esto se calculaba con `new Date(anio, mes, dia)`, o sea la medianoche
 * del navegador. Con la agente en Bolivia y el servidor en Estados Unidos, el
 * KPI y su propio filtro partían el día en momentos distintos.
 *
 * No cambia ningún instante: `fechaProgramada` sigue siendo un instante. La
 * zona solo decide dónde se corta el calendario para contar.
 */
export const ZONA_CLINICA = 'America/La_Paz';

/** El instante en que empezó el día de la clínica que contiene a `instante`. */
export function inicioDelDiaClinica(instante: Date): Date {
  const enClinica = Temporal.Instant.fromEpochMilliseconds(instante.getTime())
    .toZonedDateTimeISO(ZONA_CLINICA)
    .startOfDay();
  return new Date(enClinica.epochMilliseconds);
}

/**
 * `dias` días de CALENDARIO después del inicio de día dado.
 *
 * `add({ days })` de Temporal, no `+ n * 24 h`: el salto de mes y de año lo
 * resuelve él, y un día que no dure 24 horas seguiría cayendo en medianoche.
 */
export function sumarDiasClinica(inicioDeDia: Date, dias: number): Date {
  const siguiente = Temporal.Instant.fromEpochMilliseconds(inicioDeDia.getTime())
    .toZonedDateTimeISO(ZONA_CLINICA)
    .add({ days: dias });
  return new Date(siguiente.epochMilliseconds);
}
