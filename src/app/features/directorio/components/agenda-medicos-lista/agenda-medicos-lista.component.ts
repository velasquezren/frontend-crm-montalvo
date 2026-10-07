import { httpResource } from '@angular/common/http';
import { OverlayRef } from '@angular/cdk/overlay';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, TemplateRef, viewChild, ViewContainerRef } from '@angular/core';

import { paginaVacia, RespuestaPaginada } from '../../../../core/api/pagination.model';
import { AuthService } from '../../../../core/auth/auth.service';
import { puedeEditarAgendaClinica } from '../../../../core/auth/roles';
import { generarIniciales } from '../../../../core/auth/user.model';
import { AvatarComponent } from '../../../../shared/components/avatar/avatar.component';
import { BadgeComponent } from '../../../../shared/components/badge/badge.component';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { DialogService } from '../../../../shared/components/dialog/dialog.service';
import { EmptyStateComponent } from '../../../../shared/components/empty-state/empty-state.component';
import { ErrorCargaComponent } from '../../../../shared/components/error-carga/error-carga.component';
import { FilterChipComponent } from '../../../../shared/components/filter-chip/filter-chip.component';
import { InputComponent } from '../../../../shared/components/input/input.component';
import { LoadingSkeletonComponent } from '../../../../shared/components/loading-skeleton/loading-skeleton.component';
import { PaginatorComponent } from '../../../../shared/components/paginator/paginator.component';
import { SelectComponent } from '../../../../shared/components/select/select.component';
import { TableComponent } from '../../../../shared/components/table/table.component';
import { MonedaPipe } from '../../../../shared/pipes/moneda.pipe';
import { BancoAgenda, EspecialidadAgenda, EstadoMedicoAgenda, FichaMedicoAgenda, MedicoAgendaConWeb, nombreConTitulo } from '../../agenda-medicos.model';
import { AgendaMedicosService } from '../../agenda-medicos.service';
import { AgendaMedicoFichaComponent, PestanaFicha } from '../agenda-medico-ficha/agenda-medico-ficha.component';
import { AgendaNuevoMedicoComponent } from '../agenda-nuevo-medico/agenda-nuevo-medico.component';

interface ListaMedicosAgenda extends RespuestaPaginada<MedicoAgendaConWeb> {
  porEstado: Record<string, number>;
}

const FILTROS_ESTADO: readonly { readonly valor: EstadoMedicoAgenda | null; readonly etiqueta: string }[] = [
  { valor: 'ACTIVO', etiqueta: 'Activos' },
  { valor: 'INACTIVO', etiqueta: 'Inactivos' },
  { valor: null, etiqueta: 'Todos' },
];

/**
 * La pestaña «Médicos»: los médicos de la agenda de la clínica, con su
 * especialidad, su horario y su precio. La ficha (datos y grilla de horario) y
 * el alta se abren en un cajón.
 */
@Component({
  selector: 'app-agenda-medicos-lista',
  imports: [
    AgendaMedicoFichaComponent,
    AgendaNuevoMedicoComponent,
    AvatarComponent,
    BadgeComponent,
    ButtonComponent,
    EmptyStateComponent,
    ErrorCargaComponent,
    FilterChipComponent,
    InputComponent,
    LoadingSkeletonComponent,
    MonedaPipe,
    PaginatorComponent,
    SelectComponent,
    TableComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './agenda-medicos-lista.component.html',
})
export class AgendaMedicosListaComponent {
  private readonly servicio = inject(AgendaMedicosService);
  private readonly dialog = inject(DialogService);
  private readonly vcr = inject(ViewContainerRef);
  private readonly auth = inject(AuthService);
  private readonly fichaTpl = viewChild.required<TemplateRef<unknown>>('fichaTpl');
  private readonly nuevoTpl = viewChild.required<TemplateRef<unknown>>('nuevoTpl');
  private cajon?: OverlayRef;

  protected readonly puedeEditar = computed(() => puedeEditarAgendaClinica(this.auth.user()?.rol));
  protected readonly filtrosEstado = FILTROS_ESTADO;
  protected readonly iniciales = generarIniciales;
  protected readonly nombreConTitulo = nombreConTitulo;
  protected readonly numero = Number;

  protected readonly busqueda = signal('');
  private readonly busquedaAplicada = signal('');
  protected readonly especialidad = signal('');
  protected readonly estado = signal<EstadoMedicoAgenda | null>('ACTIVO');
  protected readonly pagina = signal(1);

  protected readonly medicos = httpResource<ListaMedicosAgenda>(
    () => this.servicio.listarRequest({ buscar: this.busquedaAplicada(), especialidad: this.especialidad(), estado: this.estado(), pagina: this.pagina() }),
    { defaultValue: { ...paginaVacia<MedicoAgendaConWeb>(), porEstado: {} } },
  );
  protected readonly especialidades = httpResource<RespuestaPaginada<EspecialidadAgenda>>(() => this.servicio.especialidadesRequest(), {
    defaultValue: paginaVacia<EspecialidadAgenda>(),
  });
  protected readonly bancos = httpResource<BancoAgenda[]>(() => this.servicio.bancosRequest(), { defaultValue: [] });

  protected readonly opcionesEspecialidad = computed(() => (this.especialidades.hasValue() ? this.especialidades.value().datos : []));
  protected readonly opcionesBanco = computed(() => (this.bancos.hasValue() ? this.bancos.value() : []));
  protected readonly hayMedicos = computed(() => this.medicos.hasValue() && this.medicos.value().datos.length > 0);
  protected readonly filtrando = computed(() => !!this.busquedaAplicada() || !!this.especialidad());

  /** Cuántos hay de cada estado (con la búsqueda y la especialidad puestas), para los chips. */
  protected cuenta(valor: EstadoMedicoAgenda | null): number | undefined {
    if (!this.medicos.hasValue()) return undefined;
    const porEstado = this.medicos.value().porEstado;
    return valor ? (porEstado[valor] ?? 0) : Object.values(porEstado).reduce((a, b) => a + b, 0);
  }

  protected readonly seleccionadoId = signal<number | null>(null);
  /** Un médico recién creado abre en «Horario»: es lo siguiente que hay que cargarle. */
  protected readonly pestanaInicial = signal<PestanaFicha>('datos');

  constructor() {
    effect(onCleanup => {
      const termino = this.busqueda();
      const temporizador = setTimeout(() => {
        this.busquedaAplicada.set(termino.trim());
        this.pagina.set(1);
      }, 300);
      onCleanup(() => clearTimeout(temporizador));
    });
  }

  protected filtrarEstado(valor: EstadoMedicoAgenda | null): void {
    this.estado.set(valor);
    this.pagina.set(1);
  }

  protected filtrarEspecialidad(valor: string): void {
    this.especialidad.set(valor);
    this.pagina.set(1);
  }

  protected abrir(id: number, pestana: PestanaFicha = 'datos'): void {
    this.pestanaInicial.set(pestana);
    this.seleccionadoId.set(id);
    this.cajon?.dispose();
    this.cajon = this.dialog.abrirCajon(this.fichaTpl(), this.vcr, {
      onClose: () => {
        this.cajon = undefined;
        this.seleccionadoId.set(null);
      },
    });
  }

  /** Lo llama la página: el botón «Nuevo médico» vive en su cabecera. */
  abrirNuevo(): void {
    this.cajon?.dispose();
    this.seleccionadoId.set(null);
    this.cajon = this.dialog.abrirCajon(this.nuevoTpl(), this.vcr, { onClose: () => (this.cajon = undefined) });
  }

  /** Recién creado: su ficha, para cargarle el horario. */
  protected alCrear(f: FichaMedicoAgenda): void {
    this.alCambiar();
    this.abrir(f.medico.id, 'horario');
  }

  protected alCambiar(): void {
    this.medicos.reload();
    this.especialidades.reload();
  }

  /** Lo llama la página cuando la pestaña de especialidades renombró alguna. */
  recargar(): void {
    this.alCambiar();
  }

  protected cerrar(): void {
    this.cajon?.dispose();
    this.cajon = undefined;
    this.seleccionadoId.set(null);
  }
}
