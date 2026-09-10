import type { CalendarEventExternal } from '@schedule-x/calendar';
import { Temporal } from 'temporal-polyfill';

import { Actividad, esActividadVencida } from '../../actividad.model';

/** Huso horario del navegador — usado solo para pintar los eventos del calendario. */
export const ZONA = Intl.DateTimeFormat().resolvedOptions().timeZone;

/**
 * Duración mínima que se le pinta a un evento, en minutos.
 *
 * Una actividad de 0 minutos existiría como una línea invisible en las vistas
 * de semana y día, imposible de pulsar.
 */
const MINUTOS_MINIMOS = 5;

/**
 * A qué calendario —y por tanto a qué color— pertenece una actividad.
 *
 * Los cuatro nombres son los mismos que declara `calendars` en el componente y
 * los mismos que pinta la leyenda del HTML. Si se añade un quinto estado hay
 * que tocar los tres sitios, o el evento sale sin color y sin entrada en la
 * leyenda.
 */
export function calendarioDe(a: Actividad): string {
  if (a.estado === 'CANCELADA') return 'neutral';
  if (a.estado === 'COMPLETADA') return 'secundaria';
  return esActividadVencida(a) ? 'critica' : 'primaria';
}

/**
 * Traduce una actividad del CRM al evento que entiende Schedule-X.
 *
 * **Vive aparte del componente a propósito.** Aquí `@schedule-x/calendar` entra
 * solo como tipo (`import type`, que se borra al compilar), así que esta lógica
 * se puede probar sin instanciar un calendario ni tocar el DOM — y lo que hay
 * que probar es justo esto: el `id`.
 *
 * **El `id` es un contrato, no un detalle.** Es lo único que une el evento
 * pintado con la actividad que representa: cuando alguien pulsa un evento, el
 * componente busca por ese id para saber qué cajón de detalle abrir. Si deja de
 * coincidir, el clic no falla — no hace nada, en silencio.
 */
export function aEventoCalendario(a: Actividad): CalendarEventExternal {
  const inicio = Temporal.Instant.from(a.fechaProgramada).toZonedDateTimeISO(ZONA);

  return {
    id: a.id,
    title: a.titulo,
    start: inicio,
    /* Duración real, no un bloque fijo — una llamada de 15 min no debe verse
       igual de alta que una reunión de una hora en las vistas de semana/día. */
    end: inicio.add({ minutes: Math.max(a.duracionMinutos, MINUTOS_MINIMOS) }),
    description: a.cliente.nombre,
    calendarId: calendarioDe(a),
  };
}
