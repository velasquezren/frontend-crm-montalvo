import { DatePipe } from '@angular/common';
import { httpResource } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  EffectCleanupRegisterFn,
  TemplateRef,
  ViewContainerRef,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';

import { OverlayRef } from '@angular/cdk/overlay';
import {
  CalendarApp,
  CalendarEventExternal,
  createCalendar,
  createViewDay,
  createViewMonthGrid,
  createViewList,
  createViewWeek,
} from '@schedule-x/calendar';
import { createCurrentTimePlugin } from '@schedule-x/current-time';
import { createEventsServicePlugin } from '@schedule-x/events-service';
import { CalendarComponent as SxCalendarComponent } from '@schedule-x/angular';
import { Temporal } from 'temporal-polyfill';
/* El CSS del tema vive en angular.json (styles globales), no como import de
   este archivo: un import CSS desde un componente lazy-loaded genera el
   chunk .css en dist/ pero esbuild no lo enlaza con ningún <link> al cargar
   la ruta — el archivo queda huérfano y la vista se ve sin estilos. Ver
   `crm-design-system` §Schedule-X. */

import { AuthService } from '../../core/auth/auth.service';
import { generarIniciales } from '../../core/auth/user.model';
import { aDatetimeLocal } from '../../core/api/fecha';
import { mensajeDeError } from '../../core/api/http-error';
import { paginaVacia, RespuestaPaginada } from '../../core/api/pagination.model';
import { ToastService } from '../../core/toast/toast.service';
import { Cliente } from '../clientes/cliente.model';
import { ClientesService } from '../clientes/clientes.service';
import { Lead, ORIGEN_LABEL } from '../leads/lead.model';
import { LeadsService } from '../leads/leads.service';
import { AvatarComponent } from '../../shared/components/avatar/avatar.component';
import { BadgeComponent, BadgeVariant } from '../../shared/components/badge/badge.component';
import { ButtonComponent } from '../../shared/components/button/button.component';
import { DialogService } from '../../shared/components/dialog/dialog.service';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { ErrorCargaComponent } from '../../shared/components/error-carga/error-carga.component';
import { FilterChipComponent } from '../../shared/components/filter-chip/filter-chip.component';
import { IconComponent } from '../../shared/components/icon/icon.component';
import { InputComponent } from '../../shared/components/input/input.component';
import { LoadingSkeletonComponent } from '../../shared/components/loading-skeleton/loading-skeleton.component';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { PaginatorComponent } from '../../shared/components/paginator/paginator.component';
import { TableComponent } from '../../shared/components/table/table.component';
import {
  Actividad,
  esActividadVencida,
  ESTADO_ACTIVIDAD_LABEL,
  EstadoActividad,
  FRECUENCIA_LABEL,
  FrecuenciaRepeticion,
  ResumenActividades,
  TIPO_ACTIVIDAD_DURACION_SUGERIDA,
  TIPO_ACTIVIDAD_ICONO,
  TIPO_ACTIVIDAD_LABEL,
  TipoActividad,
} from './actividad.model';
import { ActividadesService, FiltroActividades } from './actividades.service';

type FiltroRapido = 'PENDIENTES' | 'VENCIDAS' | 'HOY' | 'PROXIMA_SEMANA' | 'COMPLETADAS' | 'TODAS';
type Vista = 'LISTA' | 'CALENDARIO';

const TIPOS: readonly TipoActividad[] = ['LLAMADA', 'REUNION', 'TAREA', 'RECORDATORIO'];

const ESTADO_BADGE: Record<EstadoActividad, BadgeVariant> = {
  PENDIENTE: 'info',
  COMPLETADA: 'success',
  CANCELADA: 'neutral',
};

/**
 * Lo mínimo que necesita el formulario del cliente elegido. Un `Cliente`
 * completo (de la búsqueda) satisface esto de sobra por tipado estructural;
 * al editar solo tenemos estos tres campos desde `Actividad.cliente`, y así
 * no hace falta un `as Cliente` inseguro para rellenar los que faltan.
 */
interface ClienteMinimo {
  readonly id: string;
  readonly nombre: string;
  readonly telefono: string;
}

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
 * Seguimiento comercial: recordatorios y tareas de un agente sobre un
 * Cliente/Lead. NO es la agenda médica (horario clínico, app independiente) —
 * ver `crm-backend-module` (backend) para el porqué.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-actividades-page',
  imports: [
    AvatarComponent,
    BadgeComponent,
    ButtonComponent,
    DatePipe,
    EmptyStateComponent,
    ErrorCargaComponent,
    FilterChipComponent,
    IconComponent,
    InputComponent,
    LoadingSkeletonComponent,
    PageHeaderComponent,
    PaginatorComponent,
    SxCalendarComponent,
    TableComponent,
  ],
  templateUrl: './actividades.page.html',
  styleUrl: './actividades.page.css',
})
export class ActividadesPage {
  private readonly actividadesService = inject(ActividadesService);
  private readonly clientesService = inject(ClientesService);
  private readonly leadsService = inject(LeadsService);
  private readonly authService = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly dialogService = inject(DialogService);
  private readonly vcr = inject(ViewContainerRef);
  private readonly route = inject(ActivatedRoute);

  protected readonly esAdmin = this.authService.isAdmin;
  protected readonly iniciales = generarIniciales;
  protected readonly tiposLabel = TIPO_ACTIVIDAD_LABEL;
  protected readonly tipoIcono = TIPO_ACTIVIDAD_ICONO;
  protected readonly estadoLabel = ESTADO_ACTIVIDAD_LABEL;
  protected readonly estadoBadge = ESTADO_BADGE;
  protected readonly tipos = TIPOS;
  protected readonly esVencida = esActividadVencida;
  protected readonly origenLabel = ORIGEN_LABEL;

  /* ── Vista y filtros ───────────────────────────────────────────── */
  protected readonly vista = signal<Vista>('LISTA');
  protected readonly filtroRapido = signal<FiltroRapido>('PENDIENTES');
  protected readonly busqueda = signal('');
  protected readonly busquedaDebounced = signal('');
  protected readonly pagina = signal(1);

  private activeOverlayRef?: OverlayRef;
  private queryParamsProcesados = false;

  constructor() {
    effect((onCleanup: EffectCleanupRegisterFn) => {
      const texto = this.busqueda().trim();
      const timer = setTimeout(() => {
        this.busquedaDebounced.set(texto);
        this.pagina.set(1);
      }, 200);
      onCleanup(() => clearTimeout(timer));
    });

    // El calendario no repinta solo — hay que empujarle los eventos cada vez
    // que cambian los datos o el usuario entra a la vista Calendario.
    effect(() => {
      if (this.vista() !== 'CALENDARIO') return;
      this.eventosServicio.set(this.actividadesCalendario.value().datos.map(aEventoCalendario));
    });

    /**
     * Llegada desde "Agendar" en la ficha de un Lead (mismo patrón que
     * `ventas.page.ts` con "Registrar Venta"): abre el modal de creación con
     * el cliente/lead ya elegidos, sin pasar por el buscador. `modalFormTpl`
     * es un `viewChild()` (signal) y no un `@ViewChild` clásico justo para
     * que este efecto pueda reaccionar cuando la plantilla queda disponible
     * tras el primer render — los query params ya están ahí desde el
     * arranque, pero la plantilla del modal todavía no.
     */
    effect(() => {
      const tpl = this.modalFormTpl();
      if (!tpl || this.queryParamsProcesados) return;

      const qp = this.route.snapshot.queryParams;
      if (qp['nuevo'] !== '1' || !qp['clienteId'] || !qp['clienteNombre']) return;

      this.queryParamsProcesados = true;
      this.abrirCreacion();
      this.elegirCliente({
        id: qp['clienteId'],
        nombre: qp['clienteNombre'],
        telefono: qp['clienteTelefono'] ?? '',
      });
      if (qp['leadId']) this.formLeadId.set(qp['leadId']);
    });
  }

  /** Ventana de filtros derivada del chip rápido — mismo criterio que `ActividadesService.resumen`. */
  private readonly filtroFechas = computed<Pick<FiltroActividades, 'estado' | 'desde' | 'hasta'>>(() => {
    const ahora = new Date();
    const inicioHoy = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
    const finHoy = new Date(inicioHoy.getTime() + 24 * 60 * 60 * 1000);
    const en7Dias = new Date(inicioHoy.getTime() + 7 * 24 * 60 * 60 * 1000);

    switch (this.filtroRapido()) {
      case 'VENCIDAS':
        return { estado: 'PENDIENTE', hasta: inicioHoy.toISOString() };
      case 'HOY':
        return { estado: 'PENDIENTE', desde: inicioHoy.toISOString(), hasta: finHoy.toISOString() };
      case 'PROXIMA_SEMANA':
        return { estado: 'PENDIENTE', desde: finHoy.toISOString(), hasta: en7Dias.toISOString() };
      case 'COMPLETADAS':
        return { estado: 'COMPLETADA' };
      case 'TODAS':
        return {};
      default:
        return { estado: 'PENDIENTE' };
    }
  });

  protected readonly resumen = httpResource<ResumenActividades>(
    () => this.actividadesService.resumenRequest(),
    { defaultValue: { vencidas: 0, hoy: 0, proximaSemana: 0 } },
  );

  protected readonly actividades = httpResource<RespuestaPaginada<Actividad>>(
    () =>
      this.actividadesService.listarRequest({
        ...this.filtroFechas(),
        q: this.busquedaDebounced() || undefined,
        pagina: this.pagina(),
        limite: 25,
      }),
    { defaultValue: paginaVacia<Actividad>() },
  );

  /**
   * Vista Calendario: ventana amplia (sin paginar en la UI) para poder pintar
   * un mes entero. Tope real del servidor: 100 filas — si algún día una
   * agente acumula más pendientes que eso, el banner de abajo avisa en vez de
   * fingir que no hay más (mismo criterio que el techo del inbox, ver
   * `crm-backend-module`).
   */
  protected readonly actividadesCalendario = httpResource<RespuestaPaginada<Actividad>>(
    () => (this.vista() === 'CALENDARIO' ? this.actividadesService.listarRequest({ limite: 100 }) : undefined),
    { defaultValue: paginaVacia<Actividad>() },
  );

  /* ── Calendario (Schedule-X) ───────────────────────────────────── */
  private readonly eventosServicio = createEventsServicePlugin();
  protected readonly calendarApp: CalendarApp = createCalendar({
    // Mes para el panorama, semana/día para el detalle de la agenda del día
    // (con línea de "ahora" — createCurrentTimePlugin), y Lista para leer
    // todo en texto sin contar cuadrículas. Schedule-X pinta su propia
    // barra de navegación con estas cuatro vistas — no hay que maquetarla.
    views: [createViewMonthGrid(), createViewWeek(), createViewDay(), createViewList()],
    defaultView: 'month-grid',
    timezone: ZONA,
    locale: 'es-ES',
    translations: { 'es-ES': TRADUCCION_ES },
    firstDayOfWeek: 1,
    calendars: {
      // Las cuatro únicas superficies de color en la paleta cerrada — nunca
      // un hex nuevo (ver `crm-design-system`). "critica" es negro, no rojo.
      primaria: { colorName: 'primaria', label: 'A tiempo', lightColors: { main: '#006156', container: '#EAF7F5', onContainer: '#006156' } },
      secundaria: { colorName: 'secundaria', label: 'Completada', lightColors: { main: '#39ADA3', container: '#EAF7F5', onContainer: '#006156' } },
      critica: { colorName: 'critica', label: 'Vencida', lightColors: { main: '#000000', container: '#F8F9FA', onContainer: '#1F2937' } },
      neutral: { colorName: 'neutral', label: 'Cancelada', lightColors: { main: '#6B7280', container: '#F8F9FA', onContainer: '#1F2937' } },
    },
    callbacks: {
      onEventClick: evento => {
        const actividad = this.actividadesCalendario.value().datos.find(a => a.id === evento.id);
        if (actividad) this.abrirEdicion(actividad);
      },
    },
  }, [this.eventosServicio, createCurrentTimePlugin()]);

  /**
   * Sin `template` como parámetro de `abrirCreacion`/`abrirEdicion`: el clic
   * en un evento del calendario dispara `onEventClick` desde el `callbacks`
   * de `calendarApp` (arriba), que se arma en el constructor — antes de que
   * exista ninguna referencia `#modalForm` de la plantilla para pasarle.
   * `viewChild()` (signal, no el `@ViewChild` clásico) sí está resuelto para
   * entonces, porque el callback solo corre cuando el usuario ya hizo clic en
   * un evento ya renderizado — y de paso permite que el efecto de query
   * params (constructor) reaccione en cuanto la plantilla queda disponible.
   */
  protected readonly modalFormTpl = viewChild<TemplateRef<unknown>>('modalForm');

  /* ── Formulario crear/editar ───────────────────────────────────── */
  protected readonly guardando = signal(false);
  protected readonly errorForm = signal('');
  protected readonly actividadEditando = signal<Actividad | null>(null);

  protected readonly formTipo = signal<TipoActividad>('TAREA');
  protected readonly formTitulo = signal('');
  protected readonly formNotas = signal('');
  protected readonly formFecha = signal(aDatetimeLocal(new Date(Date.now() + 60 * 60 * 1000)));
  protected readonly formDuracion = signal(TIPO_ACTIVIDAD_DURACION_SUGERIDA['TAREA']);
  /** Si la persona ya tocó la duración a mano, cambiar el tipo deja de pisarla. */
  private formDuracionTocada = false;
  protected readonly formLeadId = signal<string | null>(null);

  /** Solo aplica al crear — ver `RepetirActividadDto` en el backend. */
  protected readonly frecuencias: readonly FrecuenciaRepeticion[] = ['SEMANAL', 'QUINCENAL', 'MENSUAL'];
  protected readonly frecuenciaLabel = FRECUENCIA_LABEL;
  protected readonly formRepetir = signal<FrecuenciaRepeticion | null>(null);
  protected readonly formRepetirVeces = signal(4);

  /* Búsqueda de cliente — mismo patrón que `ventas.page.ts` (RF de registrar venta) */
  protected readonly busquedaCliente = signal('');
  protected readonly clienteElegido = signal<ClienteMinimo | null>(null);

  protected readonly resultadosCliente = httpResource<readonly Cliente[]>(
    () => {
      const termino = this.busquedaCliente().trim();
      return termino.length >= 2 && !this.clienteElegido() ? this.clientesService.buscarRequest(termino) : undefined;
    },
    { defaultValue: [] },
  );

  protected readonly leadsDelCliente = httpResource<RespuestaPaginada<Lead>>(
    () => {
      const cliente = this.clienteElegido();
      return cliente ? this.leadsService.listarRequest({ clienteId: cliente.id, pagina: 1, limite: 10 }) : undefined;
    },
    { defaultValue: paginaVacia<Lead>() },
  );

  protected readonly leadsAbiertosDelCliente = computed(() =>
    this.leadsDelCliente.value().datos.filter(l => l.estado === 'NUEVO' || l.estado === 'CONTACTADO'),
  );

  /** Presets de duración — un stepper de minutos a mano invita a "37" donde nadie agenda así. */
  protected readonly duracionesPreset: readonly number[] = [5, 15, 30, 45, 60, 90, 120];

  protected formatearDuracion(minutos: number): string {
    if (minutos < 60) return `${minutos} min`;
    const horas = Math.floor(minutos / 60);
    const resto = minutos % 60;
    return resto === 0 ? `${horas} h` : `${horas} h ${resto}`;
  }

  protected elegirTipo(tipo: TipoActividad): void {
    this.formTipo.set(tipo);
    // Cambiar el tipo actualiza la duración sugerida — pero solo mientras la
    // persona no la haya tocado a mano; si ya la tocó, respeta su elección.
    if (!this.formDuracionTocada) this.formDuracion.set(TIPO_ACTIVIDAD_DURACION_SUGERIDA[tipo]);
  }

  protected elegirDuracion(minutos: number): void {
    this.formDuracionTocada = true;
    this.formDuracion.set(minutos);
  }

  protected elegirCliente(cliente: ClienteMinimo): void {
    this.clienteElegido.set(cliente);
    this.busquedaCliente.set(cliente.nombre);
    this.formLeadId.set(null);
  }

  protected limpiarCliente(): void {
    this.clienteElegido.set(null);
    this.busquedaCliente.set('');
    this.formLeadId.set(null);
  }

  protected abrirCreacion(): void {
    this.actividadEditando.set(null);
    this.formTipo.set('TAREA');
    this.formTitulo.set('');
    this.formNotas.set('');
    this.formFecha.set(aDatetimeLocal(new Date(Date.now() + 60 * 60 * 1000)));
    this.formDuracion.set(TIPO_ACTIVIDAD_DURACION_SUGERIDA['TAREA']);
    this.formDuracionTocada = false;
    this.formLeadId.set(null);
    this.formRepetir.set(null);
    this.formRepetirVeces.set(4);
    this.limpiarCliente();
    this.errorForm.set('');
    this.abrirModal(this.modalFormTpl());
  }

  protected abrirEdicion(actividad: Actividad): void {
    this.actividadEditando.set(actividad);
    this.formTipo.set(actividad.tipo);
    this.formTitulo.set(actividad.titulo);
    this.formNotas.set(actividad.notas ?? '');
    this.formFecha.set(aDatetimeLocal(new Date(actividad.fechaProgramada)));
    this.formDuracion.set(actividad.duracionMinutos);
    // Al editar, la duración ya es la real (no una sugerencia) — que cambiar
    // el tipo no la pise es lo correcto acá.
    this.formDuracionTocada = true;
    this.formLeadId.set(actividad.lead?.id ?? null);
    this.formRepetir.set(null);
    this.clienteElegido.set(actividad.cliente);
    this.busquedaCliente.set(actividad.cliente.nombre);
    this.errorForm.set('');
    this.abrirModal(this.modalFormTpl());
  }

  /** `undefined` solo en el instante antes del primer render — se ignora sin más. */
  private abrirModal(template: TemplateRef<unknown> | undefined): void {
    if (!template) return;
    this.activeOverlayRef?.dispose();
    this.activeOverlayRef = this.dialogService.openTemplate(template, this.vcr);
  }

  protected cerrarModal(): void {
    this.activeOverlayRef?.dispose();
    this.activeOverlayRef = undefined;
  }

  protected async guardar(evento: Event): Promise<void> {
    evento.preventDefault();
    this.errorForm.set('');

    const cliente = this.clienteElegido();
    if (!cliente) {
      this.errorForm.set('Elige un cliente.');
      return;
    }
    if (this.formTitulo().trim().length < 3) {
      this.errorForm.set('El título necesita al menos 3 caracteres.');
      return;
    }

    this.guardando.set(true);
    try {
      const fechaProgramada = new Date(this.formFecha()).toISOString();
      const editando = this.actividadEditando();

      if (editando) {
        await this.actividadesService.actualizar(editando.id, {
          tipo: this.formTipo(),
          titulo: this.formTitulo().trim(),
          notas: this.formNotas().trim() || undefined,
          fechaProgramada,
          duracionMinutos: this.formDuracion(),
          leadId: this.formLeadId(),
        });
        this.toast.show('Actividad actualizada.', 'success');
      } else {
        const frecuencia = this.formRepetir();
        await this.actividadesService.crear({
          tipo: this.formTipo(),
          titulo: this.formTitulo().trim(),
          notas: this.formNotas().trim() || undefined,
          fechaProgramada,
          duracionMinutos: this.formDuracion(),
          clienteId: cliente.id,
          leadId: this.formLeadId() ?? undefined,
          repetir: frecuencia ? { frecuencia, veces: this.formRepetirVeces() } : undefined,
        });
        this.toast.show(
          frecuencia ? `Actividad agendada — ${this.formRepetirVeces()} veces.` : 'Actividad agendada.',
          'success',
        );
      }

      this.cerrarModal();
      this.actividades.reload();
      this.actividadesCalendario.reload();
      this.resumen.reload();
    } catch (err) {
      this.errorForm.set(mensajeDeError(err, 'No se pudo guardar la actividad.'));
    } finally {
      this.guardando.set(false);
    }
  }

  protected async cambiarEstado(actividad: Actividad, estado: EstadoActividad): Promise<void> {
    try {
      await this.actividadesService.actualizarEstado(actividad.id, estado);
      this.toast.show(estado === 'COMPLETADA' ? 'Marcada como completada.' : 'Actividad cancelada.', 'success');
      this.actividades.reload();
      this.actividadesCalendario.reload();
      this.resumen.reload();
    } catch (err) {
      this.toast.show(mensajeDeError(err, 'No se pudo actualizar el estado.'), 'error');
    }
  }

  protected async eliminar(actividad: Actividad): Promise<void> {
    try {
      await this.actividadesService.eliminar(actividad.id);
      this.toast.show('Actividad eliminada.', 'success');
      this.actividades.reload();
      this.actividadesCalendario.reload();
      this.resumen.reload();
    } catch (err) {
      this.toast.show(mensajeDeError(err, 'No se pudo eliminar.'), 'error');
    }
  }

  protected cambiarFiltroRapido(filtro: FiltroRapido): void {
    this.filtroRapido.set(filtro);
    this.pagina.set(1);
  }
}
