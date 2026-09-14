import { ChangeDetectionStrategy, Component, ViewEncapsulation, effect, input, output } from '@angular/core';
import { CalendarComponent as SxCalendarComponent } from '@schedule-x/angular';
import {
  CalendarApp,
  CalendarEventExternal,
  createCalendar,
  createViewDay,
  createViewList,
  createViewMonthGrid,
  createViewWeek,
} from '@schedule-x/calendar';
import { createCurrentTimePlugin } from '@schedule-x/current-time';
import { createEventsServicePlugin } from '@schedule-x/events-service';
import { Temporal } from 'temporal-polyfill';
/* El tema de Schedule-X NO se importa aquí como módulo JS (`import '….css'`):
   eso sí genera un .css suelto en dist/ que esbuild no enlaza con ningún
   <link> al cargar la ruta, y la vista sale sin estilos. Viaja por
   `styleUrl` (abajo), que Angular compila DENTRO del JS del componente y
   inyecta al instanciarlo. Ver `crm-design-system`,
   §«Al partir una página en subcomponentes». */

import { Actividad, esActividadVencida } from '../../actividad.model';

/** Huso horario del navegador — usado solo para pintar los eventos del calendario. */
const ZONA = Intl.DateTimeFormat().resolvedOptions().timeZone;

/**
 * Schedule-X no trae español de fábrica — sin esto "Today"/"Month"/"Week"
 * quedaban en inglés sueltos en medio de un CRM en español. `locale: 'es-ES'`
 * solo gobierna el formato de fechas (vía Intl), no los textos de su propia
 * barra de navegación; esos se traducen aparte, por clave exacta.
 */
const TRADUCCION_ES = {
  Today: 'Hoy',
  Month: 'Mes',
  Week: 'Semana',
  Day: 'Día',
  List: 'Lista',
  'Select View': 'Elegir vista',
  View: 'Vista',
  '+ {{n}} events': '+ {{n}} más',
  '+ 1 event': '+ 1 más',
  'No events': 'Sin actividades',
  'Next period': 'Siguiente',
  'Previous period': 'Anterior',
  to: 'a',
  'Full day- and multiple day events': 'Actividades de todo el día o varios días',
  'Link to {{n}} more events on {{date}}': 'Ver {{n}} más el {{date}}',
  'Link to 1 more event on {{date}}': 'Ver 1 más el {{date}}',
  CW: 'Sem',
};

/** El `calendarId` decide el color del evento — solo tonos de la paleta cerrada (ver `crm-design-system`). */
function calendarioDe(a: Actividad): string {
  if (a.estado === 'CANCELADA') return 'neutral';
  if (a.estado === 'COMPLETADA') return 'secundaria';
  return esActividadVencida(a) ? 'critica' : 'primaria';
}

function aEventoCalendario(a: Actividad): CalendarEventExternal {
  const inicio = Temporal.Instant.from(a.fechaProgramada).toZonedDateTimeISO(ZONA);
  return {
    id: a.id,
    title: a.titulo,
    start: inicio,
    // Duración real, no un bloque fijo — una llamada de 15 min no debe verse
    // igual de alta que una reunión de una hora en las vistas de semana/día.
    end: inicio.add({ minutes: Math.max(a.duracionMinutos, 5) }),
    description: a.cliente.nombre,
    calendarId: calendarioDe(a),
  };
}

/**
 * Vista Calendario de Actividades — Schedule-X y todo lo que arrastra.
 *
 * **Vivió detrás de un `@defer` y hubo que sacarlo.** Aislarlo aquí bajó el
 * chunk de la ruta un 84 % (b6ba5f8) y la idea sigue siendo buena, pero en
 * producción la pestaña Calendario no llegaba a pintarse: la agente pulsaba y
 * se quedaba con el esqueleto hasta tocar otro filtro, que no pide datos nuevos
 * y solo fuerza un repintado. Ni el build ni las pruebas lo reproducen. Se
 * revirtió a un import normal en `actividades.page.html`, con el porqué escrito
 * ahí y en `crm-rendimiento`.
 *
 * Si alguien vuelve a diferirlo: que sea con una reproducción del fallo
 * primero, no a ciegas. El coste de tenerlo estático son ~63 kB transferidos en
 * `actividades-page`; el de tenerlo diferido fue una vista que no se veía.
 *
 * **El tema de Schedule-X viaja con este componente, ya no con angular.json.**
 * Estaba en los `styles` globales, así que sus 33,7 kB (5,4 kB gzip) entraban
 * en el paquete inicial de TODO el mundo —también en la pantalla de login, y
 * también de una agente que nunca abre la pestaña Calendario—. Ahora es un
 * `styleUrl` de este componente, que vive en el chunk de Actividades: mismos
 * bytes, pero los paga quien usa el calendario.
 *
 * Eso obliga a `ViewEncapsulation.None`, y no es un descuido: Schedule-X pinta
 * su DOM por su cuenta dentro de `<sx-calendar>`, así que esos nodos NUNCA
 * llevan el atributo `_ngcontent-…` que `Emulated` exige. Con encapsulación
 * emulada el tema compila a `.sx__…[_ngcontent-xyz]` y no casa con nada: el
 * calendario saldría sin estilos y ni el compilador ni las pruebas avisarían.
 * A cambio, el `.css` propio de este componente también se vuelve global —por
 * eso sus clases están prefijadas `crm-` y son únicas en el proyecto—.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-actividades-calendario',
  imports: [SxCalendarComponent],
  templateUrl: './actividades-calendario.component.html',
  styleUrls: [
    './actividades-calendario.component.css',
    '../../../../../../node_modules/@schedule-x/theme-default/dist/index.css',
  ],
  encapsulation: ViewEncapsulation.None,
})
export class ActividadesCalendarioComponent {
  readonly actividades = input.required<readonly Actividad[]>();

  /** Clic en un evento — la página abre su cajón de detalle. */
  readonly seleccionada = output<Actividad>();

  private readonly eventosServicio = createEventsServicePlugin();

  protected readonly calendarApp: CalendarApp = createCalendar(
    {
      views: [createViewMonthGrid(), createViewWeek(), createViewDay(), createViewList()],
      defaultView: 'month-grid',
      timezone: ZONA,
      locale: 'es-ES',
      translations: { 'es-ES': TRADUCCION_ES },
      firstDayOfWeek: 1,
      calendars: {
        primaria: {
          colorName: 'primaria',
          label: 'A tiempo',
          lightColors: { main: '#006156', container: '#EAF7F5', onContainer: '#006156' },
        },
        secundaria: {
          colorName: 'secundaria',
          label: 'Completada',
          lightColors: { main: '#39ADA3', container: '#EAF7F5', onContainer: '#006156' },
        },
        critica: {
          colorName: 'critica',
          label: 'Vencida',
          lightColors: { main: '#000000', container: '#F8F9FA', onContainer: '#1F2937' },
        },
        neutral: {
          colorName: 'neutral',
          label: 'Cancelada',
          lightColors: { main: '#6B7280', container: '#F8F9FA', onContainer: '#1F2937' },
        },
      },
      callbacks: {
        onEventClick: evento => {
          const actividad = this.actividades().find(a => a.id === evento.id);
          if (actividad) this.seleccionada.emit(actividad);
        },
      },
    },
    [this.eventosServicio, createCurrentTimePlugin()],
  );

  constructor() {
    /* El calendario no repinta solo: hay que empujarle los eventos cada vez que
       cambian. Ya no hace falta comprobar la vista activa —antes sí— porque
       este componente solo existe mientras el calendario está en pantalla. */
    effect(() => {
      this.eventosServicio.set(this.actividades().map(aEventoCalendario));
    });
  }
}
