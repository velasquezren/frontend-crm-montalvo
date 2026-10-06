import { httpResource } from '@angular/common/http';
import { OverlayRef } from '@angular/cdk/overlay';
import { ChangeDetectionStrategy, Component, computed, inject, signal, TemplateRef, viewChild, ViewContainerRef } from '@angular/core';

import { mensajeDeError } from '../../../../core/api/http-error';
import { paginaVacia, RespuestaPaginada } from '../../../../core/api/pagination.model';
import { AuthService } from '../../../../core/auth/auth.service';
import { ToastService } from '../../../../core/toast/toast.service';
import { BadgeComponent } from '../../../../shared/components/badge/badge.component';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { DialogService } from '../../../../shared/components/dialog/dialog.service';
import { DrawerComponent } from '../../../../shared/components/drawer/drawer.component';
import { EmptyStateComponent } from '../../../../shared/components/empty-state/empty-state.component';
import { ErrorCargaComponent } from '../../../../shared/components/error-carga/error-carga.component';
import { FilterChipComponent } from '../../../../shared/components/filter-chip/filter-chip.component';
import { InputComponent } from '../../../../shared/components/input/input.component';
import { LoadingSkeletonComponent } from '../../../../shared/components/loading-skeleton/loading-skeleton.component';
import { PaginatorComponent } from '../../../../shared/components/paginator/paginator.component';
import { SwitchComponent } from '../../../../shared/components/switch/switch.component';
import { TableComponent } from '../../../../shared/components/table/table.component';
import { Especialidad } from '../../directorio.model';
import { DirectorioService } from '../../directorio.service';

/**
 * La pestaña «Especialidades». No se borran —hay fichas y promociones que las
 * citan—: se desactivan, y entonces dejan de ofrecerse y de mostrarse. El slug
 * (su dirección en la landing) nace con el nombre y no cambia.
 */
@Component({
  selector: 'app-especialidades-lista',
  imports: [
    BadgeComponent,
    ButtonComponent,
    DrawerComponent,
    EmptyStateComponent,
    ErrorCargaComponent,
    FilterChipComponent,
    InputComponent,
    LoadingSkeletonComponent,
    PaginatorComponent,
    SwitchComponent,
    TableComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './especialidades-lista.component.html',
})
export class EspecialidadesListaComponent {
  private readonly servicio = inject(DirectorioService);
  private readonly toast = inject(ToastService);
  private readonly dialog = inject(DialogService);
  private readonly vcr = inject(ViewContainerRef);
  private readonly editorTpl = viewChild.required<TemplateRef<unknown>>('editorTpl');
  private cajon?: OverlayRef;

  protected readonly puedeEditar = inject(AuthService).isAdmin;
  protected readonly incluirInactivas = signal(false);
  protected readonly pagina = signal(1);
  protected readonly especialidades = httpResource<RespuestaPaginada<Especialidad>>(
    () => this.servicio.especialidadesRequest(this.pagina(), this.incluirInactivas()),
    { defaultValue: paginaVacia<Especialidad>() },
  );
  protected readonly hayEspecialidades = computed(() => this.especialidades.hasValue() && this.especialidades.value().datos.length > 0);

  /* ── Editor: la misma forma para crear (`editando` null) y editar ── */
  protected readonly editando = signal<Especialidad | null>(null);
  protected readonly nombre = signal('');
  protected readonly descripcion = signal('');
  protected readonly orden = signal('0');
  protected readonly activa = signal(true);
  protected readonly guardando = signal(false);
  protected readonly falta = computed(() => {
    if (this.nombre().trim().length < 2) return 'Escribe el nombre.';
    if (!/^\d{1,4}$/.test(this.orden().trim())) return 'El orden es un número (0 va primero).';
    return null;
  });

  protected verInactivas(si: boolean): void {
    this.incluirInactivas.set(si);
    this.pagina.set(1);
  }

  protected abrir(e: Especialidad | null): void {
    this.editando.set(e);
    this.nombre.set(e?.nombre ?? '');
    this.descripcion.set(e?.descripcion ?? '');
    this.orden.set(String(e?.orden ?? 0));
    this.activa.set(e?.activa ?? true);
    this.cajon?.dispose();
    this.cajon = this.dialog.abrirCajon(this.editorTpl(), this.vcr, { onClose: () => (this.cajon = undefined) });
  }

  protected cerrar(): void {
    this.cajon?.dispose();
    this.cajon = undefined;
  }

  protected async guardar(): Promise<void> {
    if (this.falta() || this.guardando()) return;
    const e = this.editando();
    const datos = { nombre: this.nombre().trim(), descripcion: this.descripcion().trim(), orden: Number(this.orden().trim()) };
    this.guardando.set(true);
    try {
      if (e) await this.servicio.actualizarEspecialidad(e.id, { ...datos, activa: this.activa() });
      else await this.servicio.crearEspecialidad(datos);
      this.toast.success(e ? 'Especialidad guardada.' : 'Especialidad creada.');
      this.cerrar();
      this.especialidades.reload();
    } catch (error) {
      this.toast.error(mensajeDeError(error, 'No se pudo guardar la especialidad.'));
    } finally {
      this.guardando.set(false);
    }
  }
}
