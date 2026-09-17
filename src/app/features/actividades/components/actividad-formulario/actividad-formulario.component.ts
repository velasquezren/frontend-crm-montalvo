import { httpResource } from '@angular/common/http';
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
} from '@angular/core';

import { aDatetimeLocal } from '../../../../core/api/fecha';
import { mensajeDeError } from '../../../../core/api/http-error';
import { paginaVacia, RespuestaPaginada } from '../../../../core/api/pagination.model';
import { ToastService } from '../../../../core/toast/toast.service';
import { Cliente } from '../../../clientes/cliente.model';
import { ClientesService } from '../../../clientes/clientes.service';
import { Lead, ORIGEN_LABEL } from '../../../leads/lead.model';
import { LeadsService } from '../../../leads/leads.service';
import { AvatarComponent } from '../../../../shared/components/avatar/avatar.component';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { DrawerComponent } from '../../../../shared/components/drawer/drawer.component';
import { FilterChipComponent } from '../../../../shared/components/filter-chip/filter-chip.component';
import { IconComponent } from '../../../../shared/components/icon/icon.component';
import { InputComponent } from '../../../../shared/components/input/input.component';
import { InicialesClientePipe, NombreClientePipe } from '../../../../shared/pipes/nombre-cliente.pipe';
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

/** Lo mínimo del paciente que el formulario necesita mostrar y mandar. */
export interface ClienteMinimo {
  id: string;
  nombre: string;
  telefono: string;
}

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
    AvatarComponent,
    ButtonComponent,
    DrawerComponent,
    FilterChipComponent,
    IconComponent,
    InputComponent,
    InicialesClientePipe,
    NombreClientePipe,
  ],
  templateUrl: './actividad-formulario.component.html',
})
export class ActividadFormularioComponent {
  private readonly actividadesService = inject(ActividadesService);
  private readonly clientesService = inject(ClientesService);
  private readonly leadsService = inject(LeadsService);
  private readonly toast = inject(ToastService);

  readonly contexto = input.required<ContextoFormulario>();

  readonly guardada = output<ResultadoFormulario>();
  readonly cerrado = output<void>();

  protected readonly tiposLabel = TIPO_ACTIVIDAD_LABEL;
  protected readonly tipoIcono = TIPO_ACTIVIDAD_ICONO;
  protected readonly tipos = TIPOS;
  protected readonly formatearDuracion = formatearDuracion;
  protected readonly origenLabel = ORIGEN_LABEL;

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
      this.formLeadId.set(actividad.lead?.id ?? null);
      this.formRepetir.set(null);
      this.clienteElegido.set(actividad.cliente);
      this.busquedaCliente.set(actividad.cliente.nombre);
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
    this.formLeadId.set(ctx.leadId ?? null);
    this.formRepetir.set(null);
    this.formRepetirVeces.set(4);
    this.limpiarCliente();
    this.modoNuevoCliente.set(false);
    this.nuevoClienteNombre.set('');
    this.nuevoClienteTelefono.set('');
    this.creandoCliente.set(false);
    this.errorNuevoCliente.set('');
    this.errorForm.set('');
    if (ctx.cliente) {
      this.elegirCliente(ctx.cliente);
      /* `elegirCliente` limpia el lead —cambiar de paciente invalida el suyo—,
         así que el del contexto se vuelve a poner después. */
      this.formLeadId.set(ctx.leadId ?? null);
    }
  }

  protected async guardar(evento: Event): Promise<void> {
    evento.preventDefault();
    /* El botón se deshabilita con `guardando()`, pero un Enter repetido o un
       doble clic muy rápido pueden entrar dos veces antes del repintado. Sin
       esto, «completar y agendar» crearía DOS seguimientos. */
    if (this.guardando()) return;
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
          leadId: this.formLeadId() ?? undefined,
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
