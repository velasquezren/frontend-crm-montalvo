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
  untracked,
  viewChild,
} from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { OverlayRef } from '@angular/cdk/overlay';

import { ActividadDetalleDrawerComponent } from './components/actividad-detalle-drawer/actividad-detalle-drawer.component';
import { ActividadesCalendarioComponent } from './components/actividades-calendario/actividades-calendario.component';
import {
  ActividadFormularioComponent,
  ClienteMinimo,
  ContextoFormulario,
  ResultadoFormulario,
} from './components/actividad-formulario/actividad-formulario.component';
import { mismoRango, RangoCalendario } from './rango-calendario';
import { inicioDelDiaClinica, sumarDiasClinica } from './zona-clinica';
import { AuthService } from '../../core/auth/auth.service';
import { generarIniciales } from '../../core/auth/user.model';
import { mensajeDeError } from '../../core/api/http-error';
import { paginaVacia, RespuestaPaginada } from '../../core/api/pagination.model';
import { ToastService } from '../../core/toast/toast.service';
import { ORIGEN_LABEL } from '../leads/lead.model';
import { AvatarComponent } from '../../shared/components/avatar/avatar.component';
import { BadgeComponent } from '../../shared/components/badge/badge.component';
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
import { SelectComponent } from '../../shared/components/select/select.component';
import { TableComponent } from '../../shared/components/table/table.component';
import {
  Actividad,
  esActividadVencida,
  formatearDuracion,
  ESTADO_ACTIVIDAD_LABEL,
  ESTADO_BADGE,
  EstadoActividad,
  etiquetaRepeticion,
  formatoFechaRelativa,
  ResumenActividades,
  TIPO_ACTIVIDAD_ICONO,
  TIPO_ACTIVIDAD_LABEL,
  TipoActividad,
} from './actividad.model';
import { ActividadesService, FiltroActividades } from './actividades.service';
import { InicialesClientePipe, NombreClientePipe } from '../../shared/pipes/nombre-cliente.pipe';

type FiltroRapido = 'PENDIENTES' | 'VENCIDAS' | 'HOY' | 'PROXIMA_SEMANA' | 'COMPLETADAS' | 'TODAS';
type Vista = 'LISTA' | 'CALENDARIO';

const TIPOS: readonly TipoActividad[] = ['LLAMADA', 'REUNION', 'TAREA', 'RECORDATORIO'];



/**
 * Seguimiento comercial: recordatorios y tareas de un agente sobre un
 * Cliente/Lead. NO es la agenda médica (horario clínico, app independiente) —
 * ver `crm-backend-module` (backend) para el porqué.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-actividades-page',
  imports: [
    InicialesClientePipe,
    NombreClientePipe,
    AvatarComponent,
    BadgeComponent,
    ButtonComponent,
    ActividadesCalendarioComponent,
    ActividadDetalleDrawerComponent,
    RouterLink,
    ActividadFormularioComponent,
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
    SelectComponent,
    TableComponent,
  ],
  templateUrl: './actividades.page.html',
})
export class ActividadesPage implements OnDestroy {
  private readonly actividadesService = inject(ActividadesService);
  private readonly authService = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly dialogService = inject(DialogService);
  private readonly vcr = inject(ViewContainerRef);
  private readonly route = inject(ActivatedRoute);

  protected readonly esAdmin = this.authService.isAdmin;
  protected readonly iniciales = generarIniciales;

  /* Un contacto que llegó por WhatsApp sin dar su nombre se guarda como
     "WhatsApp +591…", y entonces el título YA es el teléfono: repetirlo debajo
     era decir dos veces el mismo número. Ver `shared/models/nombre-cliente`. */
  protected readonly tiposLabel = TIPO_ACTIVIDAD_LABEL;
  protected readonly tipoIcono = TIPO_ACTIVIDAD_ICONO;
  protected readonly estadoLabel = ESTADO_ACTIVIDAD_LABEL;
  protected readonly estadoBadge = ESTADO_BADGE;
  protected readonly tipos = TIPOS;
  protected readonly esVencida = esActividadVencida;
  protected readonly formatearDuracion = formatearDuracion;
  protected readonly origenLabel = ORIGEN_LABEL;
  protected readonly formatoFechaRelativa = formatoFechaRelativa;
  protected readonly etiquetaRepeticion = etiquetaRepeticion;


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
      this.abrirCreacion(
        {
          id: qp['clienteId'],
          nombre: qp['clienteNombre'],
          telefono: qp['clienteTelefono'] ?? '',
        },
        qp['leadId'] ?? null,
      );
    });

    /* Las tres vistas de esta página se refrescan con CUALQUIER mutación de
       actividades, incluidas las que no nacen aquí: completar desde la campana
       del layout, o crear con «Actividad Rápida» desde el chat. Antes cada
       método repetía estas tres líneas —cinco veces el mismo bloque— y aun así
       solo cubría sus propias mutaciones. Ver `ActividadesService.cambios`.

       `untracked` porque `reload()` escribe los signals internos de cada
       recurso: sin él, el effect se suscribiría a lo que él mismo provoca. Es
       el fallo que documenta `crm-rendimiento`. */
    let vistas = this.actividadesService.cambios();
    effect(() => {
      const n = this.actividadesService.cambios();
      if (n === vistas) return; // primera ejecución: los recursos ya se piden solos
      vistas = n;
      untracked(() => {
        this.actividades.reload();
        this.actividadesCalendario.reload();
        this.resumen.reload();
      });
    });
  }

  ngOnDestroy(): void {
    this.activeOverlayRef?.dispose();
    this.activeDrawerRef?.dispose();
    this.overlayCancelar?.dispose();
  }

  /** Agentes comerciales activos para selector de filtrado (solo ADMIN). */
  protected readonly agentes = httpResource<Array<{ id: string; nombre: string }>>(
    () => (this.esAdmin() ? this.actividadesService.agentesRequest() : undefined),
    { defaultValue: [] },
  );

  /** Ventana de filtros derivada del chip rápido — mismo criterio que `ActividadesService.resumen`. */
  private readonly filtroFechas = computed<Pick<FiltroActividades, 'estado' | 'desde' | 'hasta'>>(() => {
    /* Los mismos tres cortes que calcula `resumen` en el backend, en la zona de
       la clínica. Antes se partía el día en la medianoche del NAVEGADOR y allá
       en la del proceso del VPS: la tarjeta «Hoy» y la lista que sale al
       pulsarla podían estar hablando de días distintos. */
    const ahora = new Date();
    const inicioHoy = inicioDelDiaClinica(ahora);
    const finHoy = sumarDiasClinica(inicioHoy, 1);
    const en7Dias = sumarDiasClinica(inicioHoy, 7);

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
   * La ventana que el calendario tiene a la vista, tal como él la publica.
   *
   * `equal` por valor y no por identidad: Schedule-X vuelve a emitir su rango
   * en repintados que no cambian de mes, y sin esto cada uno de ellos sería un
   * `httpResource` nuevo, o sea una petición idéntica más. Volver al mismo mes
   * no vuelve a preguntar.
   */
  private readonly rangoCalendario = signal<RangoCalendario | null>(null, { equal: mismoRango });

  protected registrarRangoCalendario(rango: RangoCalendario): void {
    this.rangoCalendario.set(rango);
  }

  /**
   * Vista Calendario: EXACTAMENTE el rango visible, ni más ni menos.
   *
   * Antes esto pedía `limite: 100` y ningún rango. El backend ordena
   * `fechaProgramada: 'asc'`, así que esas 100 eran las cien actividades más
   * ANTIGUAS del historial entero: con dos años de uso, el mes que la agente
   * estaba mirando podía no entrar en la página y el calendario salía vacío
   * teniendo actividades. Reproducido en `actividades.page.spec.ts` —151 en la
   * base, 100 recibidas, todas de 2024, mirando septiembre de 2026—.
   *
   * No se pide nada hasta saber qué se está mirando: el rango llega del propio
   * calendario en cuanto se monta. Y como el recurso cuelga de ese rango, una
   * respuesta de enero que llegue después de haber pasado a febrero se descarta
   * sola — es la garantía de F08, aquí sin contadores porque `httpResource` ya
   * la da al ligar la petición a su clave.
   *
   * Sigue con `limite: 100` (el tope del backend), pero ahora el tope es del
   * MES, no del historial, y el aviso de la plantilla dice cuándo se alcanza.
   */
  protected readonly actividadesCalendario = httpResource<RespuestaPaginada<Actividad>>(
    () => {
      if (this.vista() !== 'CALENDARIO') return undefined;
      const rango = this.rangoCalendario();
      if (!rango) return undefined;
      const tipo = this.filtroTipo();
      const agenteId = this.filtroAgenteId();
      return this.actividadesService.listarRequest({
        tipo: tipo === 'TODOS' ? undefined : tipo,
        agenteId: agenteId === 'TODOS' ? undefined : agenteId,
        q: this.busquedaDebounced() || undefined,
        desde: rango.desde,
        hasta: rango.hasta,
        limite: 100,
      });
    },
    { defaultValue: paginaVacia<Actividad>() },
  );

  protected readonly modalFormTpl = viewChild<TemplateRef<unknown>>('modalForm');

  /* ── Formulario crear/editar ───────────────────────────────────── */
  /**
   * La actividad que se cerrará **si** se agenda el seguimiento, y no antes.
   *
   * «Completar y agendar siguiente paso» es UNA intención. Antes se ejecutaba
   * al revés: completaba primero y abría el formulario después, así que cerrar
   * el cajón dejaba la actividad cerrada y el seguimiento sin crear — la
   * interfaz prometía una operación y hacía la mitad, justo la mitad que no
   * vale.
   *
   * El orden importa y es lo único que hace falta. De los dos desenlaces
   * posibles a medias, solo uno es inaceptable: perder el seguimiento. Quedarse
   * con las dos pendientes se ve en pantalla y se arregla con un clic. Por eso
   * esto se orquesta aquí y no con una transacción en el backend: no hay una
   * garantía de negocio que la pida, y sí un endpoint nuevo que mantener.
   */
  private readonly actividadOrigen = signal<Actividad | null>(null);

  /** Con qué se abre el formulario. La página compone el contexto y nada más. */
  protected readonly contextoFormulario = signal<ContextoFormulario | null>(null);

  protected abrirCreacion(cliente?: ClienteMinimo, leadId?: string | null): void {
    this.actividadOrigen.set(null);
    this.contextoFormulario.set({ modo: 'CREAR', cliente, leadId });
    this.abrirModal(this.modalFormTpl());
  }

  protected abrirEdicion(actividad: Actividad): void {
    this.actividadOrigen.set(null);
    this.contextoFormulario.set({ modo: 'EDITAR', actividad });
    this.abrirModal(this.modalFormTpl());
  }

  /**
   * El formulario guardó. Aquí —y solo aquí— vive la intención de A2.
   *
   * El componente no sabe que existe «completar y agendar siguiente»: agenda y
   * avisa. La regla de cerrar la anterior es de este caso de uso, no del
   * formulario, así que se queda fuera de él.
   */
  protected async alGuardarFormulario(resultado: ResultadoFormulario): Promise<void> {
    /* La intención se lee ANTES de cerrar: `cerrarModal()` la olvida, porque
       cerrar es arrepentirse. Leerla después devolvía siempre `null` y la
       original nunca se completaba — lo cazó el Caso B al extraer. */
    const origen = this.actividadOrigen();
    this.cerrarModal();

    if (resultado.modo === 'EDITAR') {
      if (this.actividadDetalle()?.id === resultado.actividad.id) {
        this.actividadDetalle.set(resultado.actividad);
      }
      this.toast.show('Actividad actualizada.', 'success');
      return;
    }

    if (resultado.modo === 'EDITAR_HORA_FUTURAS') {
      /* No llega una `Actividad`, así que no se finge tener una: el cajón de
         detalle guardaba una copia con la hora vieja y aquí no hay con qué
         refrescarla. Se cierra. La lista, el calendario y los KPIs ya se
         recargan solos por `ActividadesService.cambios`. */
      this.cerrarDetalle();
      this.avisarColectiva(
        resultado.afectadas,
        '1 actividad actualizada.',
        'actividades actualizadas.',
        'No había actividades pendientes disponibles para modificar.',
      );
      return;
    }

    if (!origen) {
      this.toast.show(
        resultado.vecesAgendadas > 1
          ? `Actividad agendada — ${resultado.vecesAgendadas} veces.`
          : 'Actividad agendada.',
        'success',
      );
      return;
    }

    /* El seguimiento ya existe: ahora, y solo ahora, se cierra la original. Si
       esto falla, lo importante está guardado y se dice lo que pasó de verdad
       en vez de cantar un éxito completo. */
    this.actividadOrigen.set(null);
    try {
      await this.actividadesService.actualizarEstado(origen.id, 'COMPLETADA');
      this.toast.show('Seguimiento agendado y actividad anterior completada.', 'success');
    } catch (err) {
      this.toast.show(
        mensajeDeError(err, 'Se agendó el seguimiento, pero la actividad anterior sigue pendiente.'),
        'error',
      );
    }
  }

  private abrirModal(template: TemplateRef<unknown> | undefined): void {
    if (!template) return;
    this.activeOverlayRef?.dispose();
    this.activeOverlayRef = this.dialogService.abrirCajon(template, this.vcr, {
      onClose: () => this.cerrarModal(),
    });
  }

  protected cerrarModal(): void {
    this.activeOverlayRef?.dispose();
    this.activeOverlayRef = undefined;
    /* Cerrar es arrepentirse: se olvida la intención y la original se queda
       como estaba. Guardar ya la consumió antes de llegar aquí. */
    this.actividadOrigen.set(null);
    this.contextoFormulario.set(null);
  }

  /* ── Detalle / Cajón Lateral (Drawer 360°) ─────────────────────── */

  protected abrirDetalle(actividad: Actividad, template?: TemplateRef<unknown>): void {
    const tpl = template ?? this.drawerDetalleTemplate();
    if (!tpl) return;
    this.actividadDetalle.set(actividad);
    this.activeDrawerRef?.dispose();
    this.activeDrawerRef = this.dialogService.abrirCajon(tpl, this.vcr, {
      onClose: () => this.cerrarDetalle(),
    });
  }

  protected cerrarDetalle(): void {
    this.actividadDetalle.set(null);
    this.activeDrawerRef?.dispose();
    this.activeDrawerRef = undefined;
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
    } catch (err) {
      this.toast.show(mensajeDeError(err, 'No se pudo reprogramar la actividad.'), 'error');
    }
  }

  /**
   * Abre el seguimiento y RECUERDA cuál cerrar al guardarlo.
   *
   * No toca la red: hasta que la agente confirme, la original sigue pendiente.
   * El prellenado es el mismo de siempre —paciente y lead— y no se amplía:
   * copiar título, tipo o notas sería inventar una regla comercial.
   */
  protected completarYAgendarSiguiente(actividad: Actividad): void {
    this.cerrarDetalle();
    this.abrirCreacion(actividad.cliente, actividad.lead?.id ?? null);
    this.actividadOrigen.set(actividad);
  }

  protected async cambiarEstado(actividad: Actividad, estado: EstadoActividad, notas?: string): Promise<void> {
    try {
      const act = await this.actividadesService.actualizarEstado(actividad.id, estado, notas);
      this.toast.show(estado === 'COMPLETADA' ? 'Marcada como completada.' : 'Actividad cancelada.', 'success');
      if (this.actividadDetalle()?.id === actividad.id) {
        this.actividadDetalle.set(act);
      }
    } catch (err) {
      this.toast.show(mensajeDeError(err, 'No se pudo actualizar el estado.'), 'error');
    }
  }

  /* ── Cancelar: una, o esta y las siguientes (A5.3) ──────────────────
   *
   * La elección de alcance vive aquí y no en el cajón de detalle porque el
   * cajón propone intenciones y no ejecuta mutaciones (A4.2). Lo que cambia con
   * A5.3 es QUÉ se ejecuta al recibir «cancelar», no quién la pide.
   */

  protected readonly actividadACancelar = signal<Actividad | null>(null);
  protected readonly alcanceCancelacion = signal<'SOLO_ESTA' | 'FUTURAS'>('SOLO_ESTA');
  protected readonly cancelando = signal(false);
  protected readonly modalCancelarTpl = viewChild<TemplateRef<unknown>>('modalCancelar');
  private overlayCancelar?: OverlayRef;

  /**
   * Cancelar. Una actividad suelta no pregunta nada: es lo de siempre.
   *
   * Solo hay algo que elegir si pertenece a una repetición VIVA. Las de antes
   * de A5.1 tienen `serieId` a `null` aunque se crearan con «repetir», así que
   * caen por el camino individual — que es la verdad: no hay nada enlazado a
   * ellas que se pueda cancelar en bloque.
   */
  protected solicitarCancelacion(actividad: Actividad): void {
    if (!actividad.serieId) {
      void this.cambiarEstado(actividad, 'CANCELADA');
      return;
    }
    const tpl = this.modalCancelarTpl();
    if (!tpl) {
      void this.cambiarEstado(actividad, 'CANCELADA');
      return;
    }
    this.actividadACancelar.set(actividad);
    this.alcanceCancelacion.set('SOLO_ESTA');
    this.overlayCancelar?.dispose();
    this.overlayCancelar = this.dialogService.openTemplate(tpl, this.vcr, {
      onClose: () => this.cerrarCancelacion(),
    });
  }

  protected cerrarCancelacion(): void {
    this.overlayCancelar?.dispose();
    this.overlayCancelar = undefined;
    this.actividadACancelar.set(null);
  }

  protected async confirmarCancelacion(): Promise<void> {
    const actividad = this.actividadACancelar();
    if (!actividad || this.cancelando()) return;

    /* «Solo esta» es el endpoint individual de siempre, sin desvíos: una
       actividad de serie no deja de ser una actividad. */
    if (this.alcanceCancelacion() !== 'FUTURAS') {
      this.cerrarCancelacion();
      await this.cambiarEstado(actividad, 'CANCELADA');
      return;
    }

    this.cancelando.set(true);
    try {
      /* Una sola escritura. `esta-y-siguientes` ya incluye a la elegida: mandar
         además el PATCH individual sería cancelarla dos veces. */
      const { afectadas } = await this.actividadesService.cancelarFuturas(actividad.id);
      this.cerrarCancelacion();
      if (this.actividadDetalle()?.id === actividad.id) this.cerrarDetalle();
      this.avisarColectiva(
        afectadas,
        '1 actividad cancelada.',
        'actividades canceladas.',
        'No había actividades pendientes disponibles para cancelar.',
      );
    } catch (err) {
      /* El diálogo se queda abierto con la misma elección: reintentar es volver
         a pulsar, y no se afirma nada que no haya pasado. */
      this.toast.show(mensajeDeError(err, 'No se pudo cancelar la repetición.'), 'error');
    } finally {
      this.cancelando.set(false);
    }
  }

  /**
   * Lo que se le dice a la agente tras una operación colectiva.
   *
   * `afectadas` es cuántas filas cambiaron de VERDAD, no cuántas se pidieron:
   * puede ser 0 porque otra persona ya las completó, o porque ninguna seguía
   * pendiente. Eso no es un fallo de red —el backend respondió bien— pero
   * tampoco es un éxito, y «0 actividades actualizadas correctamente» sería
   * decirle que hizo algo que no hizo.
   */
  private avisarColectiva(afectadas: number, una: string, varias: string, ninguna: string): void {
    if (afectadas === 0) {
      this.toast.show(ninguna, 'info');
      return;
    }
    this.toast.show(afectadas === 1 ? una : `${afectadas} ${varias}`, 'success');
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

  protected onCambiarTipo(valor: string): void {
    if (valor) {
      this.filtroTipo.set(valor as TipoActividad | 'TODOS');
      this.pagina.set(1);
    }
  }

  protected onCambiarAgente(valor: string): void {
    if (valor) {
      this.filtroAgenteId.set(valor);
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

