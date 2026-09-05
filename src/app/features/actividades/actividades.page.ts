import { DatePipe } from '@angular/common';
import { httpResource } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  EffectCleanupRegisterFn,
  OnDestroy,
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
import { KpiCardComponent } from '../../shared/components/kpi-card/kpi-card.component';
import { LoadingSkeletonComponent } from '../../shared/components/loading-skeleton/loading-skeleton.component';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { PaginatorComponent } from '../../shared/components/paginator/paginator.component';
import { TableComponent } from '../../shared/components/table/table.component';
import {
  Actividad,
  esActividadVencida,
  ESTADO_ACTIVIDAD_LABEL,
  EstadoActividad,
  formatoFechaRelativa,
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
    KpiCardComponent,
    LoadingSkeletonComponent,
    PageHeaderComponent,
    PaginatorComponent,
    SxCalendarComponent,
    TableComponent,
  ],
  templateUrl: './actividades.page.html',
  styleUrl: './actividades.page.css',
})
export class ActividadesPage implements OnDestroy {
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
  protected readonly formatoFechaRelativa = formatoFechaRelativa;

  protected labelOrigen(origen: string): string {
    const mapa: Record<string, string> = this.origenLabel;
    return mapa[origen] ?? origen;
  }

  /* ── Vista y filtros ───────────────────────────────────────────── */
  protected readonly vista = signal<Vista>('LISTA');
  protected readonly filtroRapido = signal<FiltroRapido>('PENDIENTES');
  protected readonly filtroTipo = signal<TipoActividad | 'TODOS'>('TODOS');
  protected readonly filtroAgenteId = signal<string>('TODOS');
  protected readonly busqueda = signal('');
  protected readonly busquedaDebounced = signal('');
  protected readonly pagina = signal(1);

  /* ── Detalle / Cajón Lateral (Drawer 360°) ─────────────────────── */
  protected readonly actividadDetalle = signal<Actividad | null>(null);
  protected readonly drawerDetalleTemplate = viewChild<TemplateRef<unknown>>('drawerDetalleTemplate');
  private activeDrawerRef?: OverlayRef;
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
     * el cliente/lead ya elegidos, sin pasar por el buscador.
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

  ngOnDestroy(): void {
    this.activeOverlayRef?.dispose();
    this.activeDrawerRef?.dispose();
  }

  /** Agentes comerciales activos para selector de filtrado (solo ADMIN). */
  protected readonly agentes = httpResource<Array<{ id: string; nombre: string }>>(
    () => (this.esAdmin() ? this.actividadesService.agentesRequest() : undefined),
    { defaultValue: [] },
  );

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
    () =>
      this.actividadesService.resumenRequest(
        this.filtroAgenteId() !== 'TODOS' ? { agenteId: this.filtroAgenteId() } : {},
      ),
    { defaultValue: { vencidas: 0, hoy: 0, proximaSemana: 0, completadas: 0 } },
  );

  protected readonly actividades = httpResource<RespuestaPaginada<Actividad>>(
    () => {
      const tipo = this.filtroTipo();
      const agenteId = this.filtroAgenteId();
      return this.actividadesService.listarRequest({
        ...this.filtroFechas(),
        tipo: tipo === 'TODOS' ? undefined : tipo,
        agenteId: agenteId === 'TODOS' ? undefined : agenteId,
        q: this.busquedaDebounced() || undefined,
        pagina: this.pagina(),
        limite: 25,
      });
    },
    { defaultValue: paginaVacia<Actividad>() },
  );

  /**
   * Vista Calendario: ventana amplia (sin paginar en la UI) para poder pintar
   * un mes entero. Tope real del servidor: 100 filas.
   */
  protected readonly actividadesCalendario = httpResource<RespuestaPaginada<Actividad>>(
    () => {
      if (this.vista() !== 'CALENDARIO') return undefined;
      const tipo = this.filtroTipo();
      const agenteId = this.filtroAgenteId();
      return this.actividadesService.listarRequest({
        tipo: tipo === 'TODOS' ? undefined : tipo,
        agenteId: agenteId === 'TODOS' ? undefined : agenteId,
        q: this.busquedaDebounced() || undefined,
        limite: 100,
      });
    },
    { defaultValue: paginaVacia<Actividad>() },
  );

  /* ── Calendario (Schedule-X) ───────────────────────────────────── */
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
          const actividad = this.actividadesCalendario.value().datos.find(a => a.id === evento.id);
          if (actividad) this.abrirDetalle(actividad);
        },
      },
    },
    [this.eventosServicio, createCurrentTimePlugin()],
  );

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
  private formDuracionTocada = false;
  protected readonly formLeadId = signal<string | null>(null);

  protected readonly frecuencias: readonly FrecuenciaRepeticion[] = ['SEMANAL', 'QUINCENAL', 'MENSUAL'];
  protected readonly frecuenciaLabel = FRECUENCIA_LABEL;
  protected readonly formRepetir = signal<FrecuenciaRepeticion | null>(null);
  protected readonly formRepetirVeces = signal(4);

  /* Búsqueda de cliente */
  protected readonly busquedaCliente = signal('');
  protected readonly clienteElegido = signal<ClienteMinimo | null>(null);

  /* ── Creación Express de Contacto / Paciente nuevo ────────────── */
  protected readonly modoNuevoCliente = signal(false);
  protected readonly nuevoClienteNombre = signal('');
  protected readonly nuevoClienteTelefono = signal('');
  protected readonly creandoCliente = signal(false);
  protected readonly errorNuevoCliente = signal('');

  protected activarModoNuevoCliente(valorInicial?: string): void {
    this.modoNuevoCliente.set(true);
    this.errorNuevoCliente.set('');
    const texto = (valorInicial ?? this.busquedaCliente()).trim();
    const soloDigitos = texto.replace(/\D/g, '');
    if (soloDigitos.length >= 7) {
      this.nuevoClienteTelefono.set(texto);
      this.nuevoClienteNombre.set('');
    } else {
      this.nuevoClienteNombre.set(texto);
      this.nuevoClienteTelefono.set('');
    }
  }

  protected cancelarModoNuevoCliente(): void {
    this.modoNuevoCliente.set(false);
    this.errorNuevoCliente.set('');
  }

  protected normalizarTelefono(valor: string): string | null {
    const limpio = valor.replace(/[^\d+]/g, '');
    if (/^\+\d{9,13}$/.test(limpio)) {
      return limpio;
    }
    if (/^\d{8}$/.test(limpio)) {
      return `+591${limpio}`;
    }
    return null;
  }

  protected async registrarNuevoClienteExpress(): Promise<void> {
    this.errorNuevoCliente.set('');
    const nombre = this.nuevoClienteNombre().trim();
    if (nombre.length < 2) {
      this.errorNuevoCliente.set('El nombre requiere al menos 2 caracteres.');
      return;
    }

    const telNormalizado = this.normalizarTelefono(this.nuevoClienteTelefono());
    if (!telNormalizado) {
      this.errorNuevoCliente.set('Ingresa un celular válido (8 dígitos locales o formato +591…).');
      return;
    }

    this.creandoCliente.set(true);
    try {
      const nuevo = await this.clientesService.crear({
        nombre,
        telefono: telNormalizado,
      });
      this.toast.show(`Paciente "${nuevo.nombre}" registrado.`, 'success');
      this.elegirCliente({
        id: nuevo.id,
        nombre: nuevo.nombre,
        telefono: nuevo.telefono,
      });
      this.modoNuevoCliente.set(false);
    } catch (err) {
      this.errorNuevoCliente.set(mensajeDeError(err, 'No se pudo registrar el contacto.'));
    } finally {
      this.creandoCliente.set(false);
    }
  }

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

  protected readonly duracionesPreset: readonly number[] = [5, 15, 30, 45, 60, 90, 120];

  protected formatearDuracion(minutos: number): string {
    if (minutos < 60) return `${minutos} min`;
    const horas = Math.floor(minutos / 60);
    const resto = minutos % 60;
    return resto === 0 ? `${horas} h` : `${horas} h ${resto}`;
  }

  protected elegirTipo(tipo: TipoActividad): void {
    this.formTipo.set(tipo);
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
    this.modoNuevoCliente.set(false);
  }

  protected limpiarCliente(): void {
    this.clienteElegido.set(null);
    this.busquedaCliente.set('');
    this.formLeadId.set(null);
    this.modoNuevoCliente.set(false);
    this.errorNuevoCliente.set('');
  }

  protected aplicarPresetFecha(tipo: '1H' | 'HOY_TARDE' | 'MANANA_MANANA' | 'EN_2_DIAS'): void {
    const ahora = new Date();
    let target = new Date(ahora);
    switch (tipo) {
      case '1H':
        target = new Date(ahora.getTime() + 60 * 60 * 1000);
        break;
      case 'HOY_TARDE':
        target.setHours(16, 0, 0, 0);
        if (target.getTime() <= ahora.getTime()) {
          target = new Date(ahora.getTime() + 60 * 60 * 1000);
        }
        break;
      case 'MANANA_MANANA':
        target.setDate(target.getDate() + 1);
        target.setHours(9, 30, 0, 0);
        break;
      case 'EN_2_DIAS':
        target.setDate(target.getDate() + 2);
        target.setHours(10, 0, 0, 0);
        break;
    }
    this.formFecha.set(aDatetimeLocal(target));
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
    this.modoNuevoCliente.set(false);
    this.nuevoClienteNombre.set('');
    this.nuevoClienteTelefono.set('');
    this.creandoCliente.set(false);
    this.errorNuevoCliente.set('');
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
    this.formDuracionTocada = true;
    this.formLeadId.set(actividad.lead?.id ?? null);
    this.formRepetir.set(null);
    this.clienteElegido.set(actividad.cliente);
    this.busquedaCliente.set(actividad.cliente.nombre);
    this.errorForm.set('');
    this.abrirModal(this.modalFormTpl());
  }

  private abrirModal(template: TemplateRef<unknown> | undefined): void {
    if (!template) return;
    this.activeOverlayRef?.dispose();
    this.activeOverlayRef = this.dialogService.openTemplate(template, this.vcr);
  }

  protected cerrarModal(): void {
    this.activeOverlayRef?.dispose();
    this.activeOverlayRef = undefined;
  }

  /* ── Detalle / Cajón Lateral (Drawer 360°) ─────────────────────── */

  protected abrirDetalle(actividad: Actividad, template?: TemplateRef<unknown>): void {
    const tpl = template ?? this.drawerDetalleTemplate();
    if (!tpl) return;
    this.actividadDetalle.set(actividad);
    this.activeDrawerRef?.dispose();
    this.activeDrawerRef = this.dialogService.openTemplate(tpl, this.vcr, {
      panelClass: ['fixed', 'inset-0', 'z-[101]', 'flex', 'justify-end', 'pointer-events-none'],
      onClose: () => this.cerrarDetalle(),
    });
  }

  protected cerrarDetalle(): void {
    this.actividadDetalle.set(null);
    this.activeDrawerRef?.dispose();
    this.activeDrawerRef = undefined;
  }

  protected getWhatsappLink(telefono: string, mensaje?: string): string {
    const clean = telefono.replace(/\D/g, '');
    const num = clean.startsWith('591') ? clean : `591${clean}`;
    const text = mensaje ? encodeURIComponent(mensaje) : '';
    return `https://wa.me/${num}${text ? `?text=${text}` : ''}`;
  }

  protected async reprogramarRapido(actividad: Actividad, horas: number): Promise<void> {
    try {
      const actual = new Date(actividad.fechaProgramada);
      const nueva = new Date(actual.getTime() + horas * 60 * 60 * 1000);
      const act = await this.actividadesService.actualizar(actividad.id, {
        fechaProgramada: nueva.toISOString(),
      });
      this.toast.show(`Reprogramada para ${formatoFechaRelativa(nueva.toISOString()).texto}.`, 'success');
      if (this.actividadDetalle()?.id === actividad.id) {
        this.actividadDetalle.set(act);
      }
      this.actividades.reload();
      this.actividadesCalendario.reload();
      this.resumen.reload();
    } catch (err) {
      this.toast.show(mensajeDeError(err, 'No se pudo reprogramar la actividad.'), 'error');
    }
  }

  protected async completarYAgendarSiguiente(actividad: Actividad): Promise<void> {
    try {
      await this.actividadesService.actualizarEstado(actividad.id, 'COMPLETADA');
      this.toast.show('Actividad completada. Agenda el siguiente paso comercial.', 'success');
      this.cerrarDetalle();
      this.actividades.reload();
      this.actividadesCalendario.reload();
      this.resumen.reload();

      // Abrir inmediatamente la siguiente actividad para este paciente
      this.abrirCreacion();
      this.elegirCliente({
        id: actividad.cliente.id,
        nombre: actividad.cliente.nombre,
        telefono: actividad.cliente.telefono,
      });
      if (actividad.lead) {
        this.formLeadId.set(actividad.lead.id);
      }
    } catch (err) {
      this.toast.show(mensajeDeError(err, 'No se pudo completar la actividad.'), 'error');
    }
  }

  protected async guardar(evento: Event): Promise<void> {
    evento.preventDefault();
    this.errorForm.set('');

    let cliente = this.clienteElegido();
    if (!cliente && this.modoNuevoCliente()) {
      const nombre = this.nuevoClienteNombre().trim();
      const tel = this.normalizarTelefono(this.nuevoClienteTelefono());
      if (nombre.length >= 2 && tel) {
        this.guardando.set(true);
        try {
          const creado = await this.clientesService.crear({ nombre, telefono: tel });
          cliente = { id: creado.id, nombre: creado.nombre, telefono: creado.telefono };
          this.elegirCliente(cliente);
        } catch (err) {
          this.errorForm.set(mensajeDeError(err, 'No se pudo registrar el nuevo paciente.'));
          this.guardando.set(false);
          return;
        }
      } else {
        this.errorForm.set('Completa el nombre (mínimo 2 letras) y teléfono del nuevo paciente.');
        return;
      }
    }

    if (!cliente) {
      this.errorForm.set('Elige o registra un cliente.');
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
        const actualizada = await this.actividadesService.actualizar(editando.id, {
          tipo: this.formTipo(),
          titulo: this.formTitulo().trim(),
          notas: this.formNotas().trim() || undefined,
          fechaProgramada,
          duracionMinutos: this.formDuracion(),
          leadId: this.formLeadId(),
        });
        if (this.actividadDetalle()?.id === editando.id) {
          this.actividadDetalle.set(actualizada);
        }
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

  protected async cambiarEstado(actividad: Actividad, estado: EstadoActividad, notas?: string): Promise<void> {
    try {
      const act = await this.actividadesService.actualizarEstado(actividad.id, estado, notas);
      this.toast.show(estado === 'COMPLETADA' ? 'Marcada como completada.' : 'Actividad cancelada.', 'success');
      if (this.actividadDetalle()?.id === actividad.id) {
        this.actividadDetalle.set(act);
      }
      this.actividades.reload();
      this.actividadesCalendario.reload();
      this.resumen.reload();
    } catch (err) {
      this.toast.show(mensajeDeError(err, 'No se pudo actualizar el estado.'), 'error');
    }
  }

  protected async eliminar(actividad: Actividad): Promise<void> {
    const seguro = window.confirm(
      `¿Deseas eliminar la actividad "${actividad.titulo}"? Esta acción no se puede deshacer.`,
    );
    if (!seguro) return;

    try {
      await this.actividadesService.eliminar(actividad.id);
      this.toast.show('Actividad eliminada.', 'success');
      if (this.actividadDetalle()?.id === actividad.id) {
        this.cerrarDetalle();
      }
      this.actividades.reload();
      this.actividadesCalendario.reload();
      this.resumen.reload();
    } catch (err) {
      this.toast.show(mensajeDeError(err, 'No se pudo eliminar.'), 'error');
    }
  }

  protected cambiarFiltroRapido(filtro: FiltroRapido): void {
    if (this.filtroRapido() === filtro && filtro !== 'PENDIENTES') {
      this.filtroRapido.set('PENDIENTES');
    } else {
      this.filtroRapido.set(filtro);
    }
    this.pagina.set(1);
  }

  protected onCambiarTipo(e: Event): void {
    const target = e.target as HTMLSelectElement | null;
    if (target) {
      this.filtroTipo.set(target.value as TipoActividad | 'TODOS');
      this.pagina.set(1);
    }
  }

  protected onCambiarAgente(e: Event): void {
    const target = e.target as HTMLSelectElement | null;
    if (target) {
      this.filtroAgenteId.set(target.value);
      this.pagina.set(1);
    }
  }

  protected readonly tieneFiltrosActivos = computed(() => {
    return (
      this.busqueda().trim().length > 0 ||
      this.filtroRapido() !== 'PENDIENTES' ||
      this.filtroTipo() !== 'TODOS' ||
      this.filtroAgenteId() !== 'TODOS'
    );
  });

  protected limpiarTodosLosFiltros(): void {
    this.busqueda.set('');
    this.busquedaDebounced.set('');
    this.filtroRapido.set('PENDIENTES');
    this.filtroTipo.set('TODOS');
    this.filtroAgenteId.set('TODOS');
    this.pagina.set(1);
  }
}

