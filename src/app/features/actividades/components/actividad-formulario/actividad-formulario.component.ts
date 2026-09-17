import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';

import { aDatetimeLocal } from '../../../../core/api/fecha';
import { mensajeDeError } from '../../../../core/api/http-error';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { DrawerComponent } from '../../../../shared/components/drawer/drawer.component';
import { FilterChipComponent } from '../../../../shared/components/filter-chip/filter-chip.component';
import { IconComponent } from '../../../../shared/components/icon/icon.component';
import { InputComponent } from '../../../../shared/components/input/input.component';
import {
  Actividad,
  formatearDuracion,
  FRECUENCIA_LABEL,
  FrecuenciaRepeticion,
  TIPO_ACTIVIDAD_DURACION_SUGERIDA,
  TIPO_ACTIVIDAD_ICONO,
  TIPO_ACTIVIDAD_LABEL,
  TipoActividad,
} from '../../actividad.model';
import { ActividadesService } from '../../actividades.service';
import {
  ClienteMinimo,
  SeleccionPaciente,
  SelectorClienteExpressComponent,
} from '../selector-cliente-express/selector-cliente-express.component';

export type { ClienteMinimo };

/**
 * Con qué llega el formulario. Es UN input, no veinte.
 *
 * La página no controla el formulario campo por campo: le entrega el contexto
 * de partida y se desentiende. Al crear puede venir un paciente y un lead ya
 * elegidos —desde el detalle, desde «completar y agendar siguiente» o desde el
 * enlace «Agendar» de un Lead—; al editar viene la actividad entera.
 */
export type ContextoFormulario =
  | { modo: 'CREAR'; cliente?: ClienteMinimo; leadId?: string | null }
  | { modo: 'EDITAR'; actividad: Actividad };

/** Lo que el formulario devuelve al guardar. */
export interface ResultadoFormulario {
  modo: 'CREAR' | 'EDITAR';
  actividad: Actividad;
  /** 1, o las veces agendadas si se usó la repetición. Lo usa el aviso. */
  vecesAgendadas: number;
}

const TIPOS: readonly TipoActividad[] = ['LLAMADA', 'REUNION', 'TAREA', 'RECORDATORIO'];

/**
 * El formulario de crear y editar una actividad.
 *
 * Uno solo para los dos modos: lo que cambia es el contexto de entrada, no el
 * formulario. Tener dos habría sido tener dos sitios donde acertar la misma
 * validación.
 *
 * **Estado con signals, no Reactive Forms.** Es lo que ya usaba esta pantalla y
 * lo que usa el resto del CRM con `[(value)]` sobre `<app-input>`; extraerlo no
 * es motivo para cambiar de tecnología. El día que haga falta validación
 * declarativa o campos dinámicos, ese cambio se discute aparte.
 *
 * **Lo que este componente NO sabe:** que existe «completar y agendar
 * siguiente». Esa es una intención de la página, que al recibir `guardada`
 * cierra la actividad de origen. El formulario solo agenda.
 */
@Component({
  selector: 'app-actividad-formulario',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ButtonComponent,
    DrawerComponent,
    FilterChipComponent,
    IconComponent,
    InputComponent,
    SelectorClienteExpressComponent,
  ],
  templateUrl: './actividad-formulario.component.html',
})
export class ActividadFormularioComponent {
  private readonly actividadesService = inject(ActividadesService);

  readonly contexto = input.required<ContextoFormulario>();

  readonly guardada = output<ResultadoFormulario>();
  readonly cerrado = output<void>();

  protected readonly tiposLabel = TIPO_ACTIVIDAD_LABEL;
  protected readonly tipoIcono = TIPO_ACTIVIDAD_ICONO;
  protected readonly tipos = TIPOS;
  protected readonly formatearDuracion = formatearDuracion;

  /**
   * El selector es dueño de la interacción; esto es solo su RESULTADO.
   *
   * Va en una dirección y no vuelve: el selector avisa, el formulario apunta.
   * Aquí no se escribe nunca, así que no hay dos copias que sincronizar.
   */
  protected readonly seleccion = signal<SeleccionPaciente | null>(null);

  /** Con qué arranca el selector, derivado del contexto. */
  protected readonly seleccionInicial = computed<SeleccionPaciente | null>(() => {
    const ctx = this.contexto();
    if (ctx.modo === 'EDITAR') {
      return { cliente: ctx.actividad.cliente, leadId: ctx.actividad.lead?.id ?? null };
    }
    return ctx.cliente ? { cliente: ctx.cliente, leadId: ctx.leadId ?? null } : null;
  });

  private readonly selector = viewChild(SelectorClienteExpressComponent);

  protected readonly guardando = signal(false);
  protected readonly errorForm = signal('');
  protected readonly actividadEditando = signal<Actividad | null>(null);


  protected readonly formTipo = signal<TipoActividad>('TAREA');
  protected readonly formTitulo = signal('');
  protected readonly formNotas = signal('');
  protected readonly formFecha = signal(aDatetimeLocal(new Date(Date.now() + 60 * 60 * 1000)));
  protected readonly formDuracion = signal(TIPO_ACTIVIDAD_DURACION_SUGERIDA['TAREA']);
  private formDuracionTocada = false;

  protected readonly frecuencias: readonly FrecuenciaRepeticion[] = ['SEMANAL', 'QUINCENAL', 'MENSUAL'];
  protected readonly frecuenciaLabel = FRECUENCIA_LABEL;
  protected readonly formRepetir = signal<FrecuenciaRepeticion | null>(null);
  protected readonly formRepetirVeces = signal(4);

  /* Búsqueda de cliente */
  protected readonly duracionesPreset: readonly number[] = [5, 15, 30, 45, 60, 90, 120];

  protected elegirTipo(tipo: TipoActividad): void {
    this.formTipo.set(tipo);
    if (!this.formDuracionTocada) this.formDuracion.set(TIPO_ACTIVIDAD_DURACION_SUGERIDA[tipo]);
  }

  protected elegirDuracion(minutos: number): void {
    this.formDuracionTocada = true;
    this.formDuracion.set(minutos);
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

  constructor() {
    /* Se siembra desde el contexto y ya. No hay sincronización de vuelta: a
       partir de aquí el dueño del estado del formulario es este componente, y
       la página no guarda una segunda copia de ningún campo.
       `untracked` porque sembrar ESCRIBE los mismos signals que el resto de la
       plantilla lee; sin él, el effect se dispararía a sí mismo. */
    effect(() => {
      const ctx = this.contexto();
      untracked(() => this.sembrar(ctx));
    });
  }

  private sembrar(ctx: ContextoFormulario): void {
    if (ctx.modo === 'EDITAR') {
      const actividad = ctx.actividad;
      this.actividadEditando.set(actividad);
      this.formTipo.set(actividad.tipo);
      this.formTitulo.set(actividad.titulo);
      this.formNotas.set(actividad.notas ?? '');
      this.formFecha.set(aDatetimeLocal(new Date(actividad.fechaProgramada)));
      this.formDuracion.set(actividad.duracionMinutos);
      this.formDuracionTocada = true;
      this.formRepetir.set(null);
      this.errorForm.set('');
      return;
    }

    this.actividadEditando.set(null);
    this.formTipo.set('TAREA');
    this.formTitulo.set('');
    this.formNotas.set('');
    this.formFecha.set(aDatetimeLocal(new Date(Date.now() + 60 * 60 * 1000)));
    this.formDuracion.set(TIPO_ACTIVIDAD_DURACION_SUGERIDA['TAREA']);
    this.formDuracionTocada = false;
    this.formRepetir.set(null);
    this.formRepetirVeces.set(4);
    this.errorForm.set('');
  }

  protected async guardar(evento: Event): Promise<void> {
    evento.preventDefault();
    /* El botón se deshabilita con `guardando()`, pero un Enter repetido o un
       doble clic muy rápido pueden entrar dos veces antes del repintado. Sin
       esto, «completar y agendar» crearía DOS seguimientos. */
    if (this.guardando()) return;
    this.errorForm.set('');

    /* El paciente lo resuelve el selector: es el único que puede terminar un
       alta express a medias, porque los campos son suyos. Aquí solo se traduce
       el desenlace a los mensajes que esta pantalla siempre ha dado — que NO
       son los del botón «Registrar», y esa diferencia es de producto. */
    this.guardando.set(true);
    const resolucion = await (this.selector()?.resolverSeleccion() ??
      Promise.resolve({ ok: false as const, motivo: 'SIN_PACIENTE' as const }));
    this.guardando.set(false);

    if (!resolucion.ok) {
      if (resolucion.motivo === 'SIN_PACIENTE') {
        this.errorForm.set('Elige o registra un cliente.');
      } else if (resolucion.motivo === 'FALLO_ALTA') {
        this.errorForm.set(mensajeDeError(resolucion.error, 'No se pudo registrar el nuevo paciente.'));
      } else {
        this.errorForm.set('Completa el nombre (mínimo 2 letras) y teléfono del nuevo paciente.');
      }
      return;
    }

    const { cliente, leadId } = resolucion.seleccion;
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
          leadId,
        });
        this.guardada.emit({ modo: 'EDITAR', actividad: actualizada, vecesAgendadas: 1 });
      } else {
        const frecuencia = this.formRepetir();
        const creada = await this.actividadesService.crear({
          tipo: this.formTipo(),
          titulo: this.formTitulo().trim(),
          notas: this.formNotas().trim() || undefined,
          fechaProgramada,
          duracionMinutos: this.formDuracion(),
          clienteId: cliente.id,
          leadId: leadId ?? undefined,
          repetir: frecuencia ? { frecuencia, veces: this.formRepetirVeces() } : undefined,
        });

        this.guardada.emit({
          modo: 'CREAR',
          actividad: creada,
          vecesAgendadas: frecuencia ? this.formRepetirVeces() : 1,
        });
      }
    } catch (err) {
      this.errorForm.set(mensajeDeError(err, 'No se pudo guardar la actividad.'));
    } finally {
      this.guardando.set(false);
    }
  }
}
