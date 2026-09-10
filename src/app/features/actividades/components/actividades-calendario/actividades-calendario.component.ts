import { ChangeDetectionStrategy, Component, computed, effect, input, output } from '@angular/core';
import { CalendarComponent as SxCalendarComponent } from '@schedule-x/angular';
import {
  CalendarApp,
  createCalendar,
  createViewDay,
  createViewList,
  createViewMonthGrid,
  createViewWeek,
} from '@schedule-x/calendar';
import { createCurrentTimePlugin } from '@schedule-x/current-time';
import { createEventsServicePlugin } from '@schedule-x/events-service';
/* El CSS del tema vive en angular.json (styles globales), no como import de
   este archivo: un import CSS desde un componente lazy-loaded genera el
   chunk .css en dist/ pero esbuild no lo enlaza con ningún <link> al cargar
   la ruta — el archivo queda huérfano y la vista se ve sin estilos. Ver
   `crm-design-system` §Schedule-X. */

import { Actividad } from '../../actividad.model';
import { aEventoCalendario, ZONA } from './actividad-a-evento';

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
 * El CSS del tema sigue siendo global (angular.json): mover el HTML sin su CSS
 * es la trampa que documenta el §8 de `check:skills`, y con una librería de
 * terceros no avisa ni el compilador. Con este componente viaja su `.css`
 * propio, pero solo la leyenda y la CAJA del calendario: **las variables
 * `--sx-color-*` de la marca viven en `styles.css`**, porque el selector de
 * fecha se teleporta al `body` y desde fuera del envoltorio no heredaría
 * ninguna — se pintaría con el morado por defecto de Schedule-X.
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

  /**
   * Índice por id para resolver el evento pulsado sin recorrer la lista.
   *
   * Antes era un `find` sobre el array en cada clic. Se cambia por dos motivos,
   * y el segundo es el que importa:
   *
   * 1. El calendario carga hasta el tope de su consulta, así que el `find` crece
   *    con el mes; un `Map` derivado se recalcula solo cuando cambian las
   *    actividades, no una vez por clic.
   * 2. **La clave se normaliza a `string`.** El `id` de un evento de Schedule-X
   *    es `string | number` por contrato, y la comparación anterior era `===`
   *    estricta contra el `id` de la actividad. Si la librería devolviera el id
   *    con otro tipo, la comparación fallaría, el `if` se lo tragaría en
   *    silencio y el clic no haría absolutamente nada — sin error, sin log y
   *    sin forma de saber por qué.
   */
  private readonly porId = computed(
    () => new Map(this.actividades().map(a => [String(a.id), a] as const)),
  );

  private readonly eventosServicio = createEventsServicePlugin();

  protected readonly calendarApp: CalendarApp = createCalendar(
    {
      views: [createViewMonthGrid(), createViewWeek(), createViewDay(), createViewList()],
      defaultView: 'month-grid',
      /*
       * El selector de fecha de la cabecera se saca del componente y se cuelga
       * del `body`.
       *
       * Sin esto se cortaba por abajo, y el motivo no está en Schedule-X sino
       * aquí: `.crm-calendario-wrapper` lleva `overflow: hidden` —lo necesita
       * para que el contenido respete sus esquinas redondeadas— y ese recorte
       * también alcanza al popup, que es `position: absolute` y cuelga de la
       * cabecera. O sea que el desplegable solo podía dibujarse DENTRO de la
       * caja del calendario.
       *
       * Por eso se veía bien en la vista de semana y mal en la de mes: no es
       * que el popup cambie, es cuánto sitio le queda por debajo antes del
       * borde inferior del recorte.
       *
       * `teleportTo` es la salida que da la librería, y no es solo mover el
       * nodo: al teleportarse pasa a `position: fixed` con las coordenadas
       * calculadas del `getBoundingClientRect()` del disparador, y se
       * reposiciona sola al hacer scroll. Así deja de depender del alto del
       * calendario y funciona igual en las cuatro vistas.
       *
       * El `typeof document` es por el prerender de Vercel, donde no hay DOM;
       * `teleportTo` es opcional, así que `undefined` es un valor válido. Mismo
       * criterio que `api.constants.ts` con `window`.
       */
      datePicker: {
        teleportTo: typeof document === 'undefined' ? undefined : document.body,
      },
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
        /* Un clic en un evento abre EL MISMO cajón de detalle que una fila de
           la lista: la página escucha `seleccionada` y llama a `abrirDetalle`,
           igual que hacen los tres puntos de la vista de lista. La regla es que
           el detalle de una actividad se pinta en un solo sitio; este
           componente solo dice cuál se pulsó. */
        onEventClick: evento => {
          const actividad = this.porId().get(String(evento.id));
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
