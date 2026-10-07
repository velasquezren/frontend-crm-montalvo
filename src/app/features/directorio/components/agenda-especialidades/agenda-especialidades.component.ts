import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, output, signal } from '@angular/core';

import { mensajeDeError } from '../../../../core/api/http-error';
import { paginaVacia, RespuestaPaginada } from '../../../../core/api/pagination.model';
import { AuthService } from '../../../../core/auth/auth.service';
import { puedeEditarAgendaClinica } from '../../../../core/auth/roles';
import { ToastService } from '../../../../core/toast/toast.service';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { EmptyStateComponent } from '../../../../shared/components/empty-state/empty-state.component';
import { ErrorCargaComponent } from '../../../../shared/components/error-carga/error-carga.component';
import { InputComponent } from '../../../../shared/components/input/input.component';
import { LoadingSkeletonComponent } from '../../../../shared/components/loading-skeleton/loading-skeleton.component';
import { TableComponent } from '../../../../shared/components/table/table.component';
import { EspecialidadAgenda } from '../../agenda-medicos.model';
import { AgendaMedicosService } from '../../agenda-medicos.service';

/** Para comparar nombres como lo hace la agenda: sin mayúsculas, tildes ni espacios de más. */
const normalizar = (texto: string) => texto.normalize('NFD').replace(/\p{Diacritic}/gu, '').trim().toLowerCase();

/**
 * La pestaña «Especialidades»: las que están escritas en los médicos de la
 * agenda (es texto libre, por eso hay casi-duplicados como «Pediatra» y
 * «Pediatria»). Renombrar una con el nombre de otra las unifica.
 */
@Component({
  selector: 'app-agenda-especialidades',
  imports: [ButtonComponent, EmptyStateComponent, ErrorCargaComponent, InputComponent, LoadingSkeletonComponent, TableComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './agenda-especialidades.component.html',
})
export class AgendaEspecialidadesComponent {
  private readonly servicio = inject(AgendaMedicosService);
  private readonly toast = inject(ToastService);
  private readonly auth = inject(AuthService);

  /** Avisa a la pestaña de médicos: sus especialidades cambiaron. */
  readonly cambio = output<void>();

  protected readonly puedeEditar = computed(() => puedeEditarAgendaClinica(this.auth.user()?.rol));
  protected readonly especialidades = httpResource<RespuestaPaginada<EspecialidadAgenda>>(() => this.servicio.especialidadesRequest(), {
    defaultValue: paginaVacia<EspecialidadAgenda>(),
  });

  protected readonly editando = signal<string | null>(null);
  protected readonly nuevoNombre = signal('');
  protected readonly guardando = signal(false);

  /** Si el nombre nuevo ya existe, se unifican: se avisa antes de guardar. */
  protected readonly unificaCon = computed(() => {
    const actual = this.editando();
    const nuevo = normalizar(this.nuevoNombre());
    if (!actual || !nuevo || !this.especialidades.hasValue()) return null;
    return this.especialidades.value().datos.find(e => e.nombre !== actual && normalizar(e.nombre) === nuevo) ?? null;
  });

  protected editar(e: EspecialidadAgenda): void {
    this.editando.set(e.nombre);
    this.nuevoNombre.set(e.nombre);
  }

  protected cancelar(): void {
    this.editando.set(null);
  }

  protected async guardar(): Promise<void> {
    const actual = this.editando();
    const nueva = this.nuevoNombre().trim();
    if (!actual || !nueva || nueva === actual || this.guardando()) return;
    this.guardando.set(true);
    try {
      const r = await this.servicio.renombrarEspecialidad(actual, this.unificaCon()?.nombre ?? nueva);
      this.toast.success(`${r.medicos} ${r.medicos === 1 ? 'médico actualizado' : 'médicos actualizados'}.`, 'Listo');
      this.editando.set(null);
      this.especialidades.reload();
      this.cambio.emit();
    } catch (err) {
      this.toast.error(mensajeDeError(err, 'No se pudo renombrar la especialidad.'), 'Error');
    } finally {
      this.guardando.set(false);
    }
  }
}
