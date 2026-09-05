import { ChangeDetectionStrategy, Component, effect, input, output } from '@angular/core';
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
/* El CSS del tema vive en angular.json (styles globales), no como import de
   este archivo: un import CSS desde un componente lazy-loaded genera el
   chunk .css en dist/ pero esbuild no lo enlaza con ningún <link> al cargar
   la ruta — el archivo queda huérfano y la vista se ve sin estilos. Ver
   `crm-design-system` §Schedule-X. */

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
 * **Existe para poder diferirlo.** Con el calendario dentro de
 * `actividades.page.ts`, sus cuatro paquetes (`@schedule-x/calendar`,
 * `/angular`, `/current-time`, `/events-service`) y el `temporal-polyfill`
 * viajaban en el chunk de la ruta: la agente pagaba la librería entera al abrir
 * Actividades aunque la vista por defecto sea **Lista** y muchas nunca toquen la
 * pestaña Calendario. En un CRM que se usa desde el móvil con conexión mediocre
 * —donde el 97 % de una navegación es red (ver CLAUDE.md)— eso es el peor sitio
 * posible para 250 kB.
 *
 * Aislado aquí y cargado con `@defer (when …)`, la librería solo baja cuando
 * alguien pulsa Calendario, y una vez cargada se queda.
 *
 * El CSS del tema sigue siendo global (angular.json): mover el HTML sin su CSS
 * es la trampa que documenta el §8 de `check:skills`, y con una librería de
 * terceros no avisa ni el compilador. Lo que sí viaja con este componente es su
 * `.css` propio —la leyenda y las variables `--sx-*`—, que es lo que reestiliza
 * Schedule-X sin tocar sus clases hasheadas.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-actividades-calendario',
  imports: [SxCalendarComponent],
  templateUrl: './actividades-calendario.component.html',
  styleUrl: './actividades-calendario.component.css',
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
