import { httpResource } from '@angular/common/http';
import { OverlayRef } from '@angular/cdk/overlay';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  output,
  signal,
  TemplateRef,
  untracked,
  viewChild,
  ViewContainerRef,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { map } from 'rxjs';

import { paginaVacia, RespuestaPaginada } from '../../../../core/api/pagination.model';
import { AuthService } from '../../../../core/auth/auth.service';
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
import { Especialidad, FichaResumen } from '../../directorio.model';
import { DirectorioService } from '../../directorio.service';
import { MedicoFichaComponent } from '../medico-ficha/medico-ficha.component';

const FILTROS_PUBLICACION: readonly { readonly valor: boolean | null; readonly etiqueta: string }[] = [
  { valor: null, etiqueta: 'Todos' },
  { valor: true, etiqueta: 'Publicados' },
  { valor: false, etiqueta: 'Ocultos' },
];

/** La pestaña «Médicos»: las fichas, con su horario resumido y la ficha en un cajón. */
@Component({
  selector: 'app-medicos-lista',
  imports: [
    AvatarComponent,
    BadgeComponent,
    ButtonComponent,
    EmptyStateComponent,
    ErrorCargaComponent,
    FilterChipComponent,
    InputComponent,
    LoadingSkeletonComponent,
    MedicoFichaComponent,
    MonedaPipe,
    PaginatorComponent,
    SelectComponent,
    TableComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './medicos-lista.component.html',
})
export class MedicosListaComponent {
  private readonly servicio = inject(DirectorioService);
  private readonly dialog = inject(DialogService);
  private readonly vcr = inject(ViewContainerRef);
  private readonly router = inject(Router);
  private readonly fichaTpl = viewChild.required<TemplateRef<unknown>>('fichaTpl');
  private cajon?: OverlayRef;

  readonly nueva = output<void>();
  protected readonly puedeEditar = inject(AuthService).isAdmin;
  protected readonly filtrosPublicacion = FILTROS_PUBLICACION;
  protected readonly iniciales = generarIniciales;

  protected readonly busqueda = signal('');
  private readonly busquedaAplicada = signal('');
  protected readonly especialidadId = signal('');
  protected readonly publicado = signal<boolean | null>(null);
  protected readonly pagina = signal(1);

  protected readonly fichas = httpResource<RespuestaPaginada<FichaResumen>>(
    () =>
      this.servicio.fichasRequest({
        buscar: this.busquedaAplicada(),
        especialidadId: this.especialidadId(),
        publicado: this.publicado(),
        pagina: this.pagina(),
      }),
    { defaultValue: paginaVacia<FichaResumen>() },
  );
  protected readonly especialidades = httpResource<RespuestaPaginada<Especialidad>>(() => this.servicio.especialidadesActivasRequest(), {
    defaultValue: paginaVacia<Especialidad>(),
  });
  protected readonly opcionesEspecialidad = computed(() => (this.especialidades.hasValue() ? this.especialidades.value().datos : []));
  protected readonly hayFichas = computed(() => this.fichas.hasValue() && this.fichas.value().datos.length > 0);
  protected readonly filtrando = computed(() => !!this.busquedaAplicada() || !!this.especialidadId() || this.publicado() !== null);

  protected readonly seleccionadaId = signal<string | null>(null);
  private readonly idEnRuta = toSignal(inject(ActivatedRoute).queryParamMap.pipe(map(p => p.get('id'))), { initialValue: null });

  constructor() {
    effect(onCleanup => {
      const termino = this.busqueda();
      const temporizador = setTimeout(() => {
        this.busquedaAplicada.set(termino.trim());
        this.pagina.set(1);
      }, 300);
      onCleanup(() => clearTimeout(temporizador));
    });

    effect(() => {
      const id = this.idEnRuta();
      if (!id) return;
      untracked(() => {
        void this.router.navigate([], { queryParams: { id: null }, queryParamsHandling: 'merge', replaceUrl: true });
        this.fichas.reload();
        this.abrir(id);
      });
    });
  }

  protected filtrarEspecialidad(id: string): void {
    this.especialidadId.set(id);
    this.pagina.set(1);
  }

  protected filtrarPublicacion(valor: boolean | null): void {
    this.publicado.set(valor);
    this.pagina.set(1);
  }

  protected abrir(id: string): void {
    this.seleccionadaId.set(id);
    this.cajon?.dispose();
    this.cajon = this.dialog.abrirCajon(this.fichaTpl(), this.vcr, {
      onClose: () => {
        this.cajon = undefined;
        this.seleccionadaId.set(null);
      },
    });
  }

  protected cerrar(): void {
    this.cajon?.dispose();
    this.cajon = undefined;
    this.seleccionadaId.set(null);
  }
}
