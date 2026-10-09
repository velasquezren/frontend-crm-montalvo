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
 * Vive en `core/fechas/` para que el espejo sea literal (`common/fechas/` allá).
 * Estuvo en `features/actividades/` hasta el 2026-10-08, y eso lo convertía en
 * una dependencia de *actividades*: cinco features ajenas —conversaciones,
 * reservas, campañas, promociones, líneas— importaban de ahí la zona de la
 * clínica, y `shared/` acabó dependiendo de una feature para saber dónde
 * empieza el día. La zona horaria no es de ningún módulo; es del CRM.
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

/** `instante` visto desde el calendario de la clínica. */
function enClinica(instante: Date): Temporal.ZonedDateTime {
  return Temporal.Instant.fromEpochMilliseconds(instante.getTime()).toZonedDateTimeISO(ZONA_CLINICA);
}

/**
 * ¿Los dos instantes caen en el MISMO día del calendario de la clínica?
 *
 * La pregunta parece trivial y no lo es: dos instantes pueden caer en días
 * distintos en UTC —o en el navegador de quien mira— y seguir siendo el mismo
 * día en la clínica. Un martes a las 21:00 de Bolivia ya es miércoles en UTC.
 *
 * Lo usa A5.3 para decidir si una edición es «solo cambió la hora», que es lo
 * único que el backend sabe propagar a las futuras. Con la zona del navegador,
 * la misma edición habría ofrecido propagar o no según dónde estuviera sentada
 * la agente.
 */
export function mismoDiaClinica(a: Date, b: Date): boolean {
  return enClinica(a).toPlainDate().equals(enClinica(b).toPlainDate());
}

/**
 * La hora de reloj de la clínica, «HH:MM».
 *
 * Es exactamente lo que espera `PATCH :id/esta-y-siguientes/hora`, que la
 * reinterpreta con `conHoraClinica` sobre el día de cada ocurrencia. Mandar la
 * hora del navegador dejaría cada fila a una hora que allí nadie eligió.
 */
export function horaClinica(instante: Date): string {
  const z = enClinica(instante);
  return `${String(z.hour).padStart(2, '0')}:${String(z.minute).padStart(2, '0')}`;
}

/**
 * El día de calendario de La Paz como «2026-10-13»: el formato de las columnas
 * `@db.Date` del backend (vigencias de promociones, ausencias de médicos).
 * Gemelo de `fechaCivilClinica` en el backend.
 */
export function fechaCivilClinica(instante: Date): string {
  return Temporal.Instant.fromEpochMilliseconds(instante.getTime()).toZonedDateTimeISO(ZONA_CLINICA).toPlainDate().toString();
}
