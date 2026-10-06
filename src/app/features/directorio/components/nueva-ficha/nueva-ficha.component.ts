import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, effect, inject, output, signal } from '@angular/core';

import { mensajeDeError } from '../../../../core/api/http-error';
import { paginaVacia, RespuestaPaginada } from '../../../../core/api/pagination.model';
import { ToastService } from '../../../../core/toast/toast.service';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { DrawerComponent } from '../../../../shared/components/drawer/drawer.component';
import { FilterChipComponent } from '../../../../shared/components/filter-chip/filter-chip.component';
import { IconComponent } from '../../../../shared/components/icon/icon.component';
import { InputComponent } from '../../../../shared/components/input/input.component';
import { SelectComponent } from '../../../../shared/components/select/select.component';
import { Especialidad, FichaMedico, MedicoSinFicha } from '../../directorio.model';
import { DirectorioService } from '../../directorio.service';

/**
 * «Nueva ficha»: el nombre con que se presenta y, si está en la planilla de
 * comisiones, a qué médico corresponde (su código de FileMaker). Así es la
 * misma persona para las ventas, la planilla y el directorio. El horario, la
 * foto y la biografía se completan en la ficha, que se abre al crearla.
 */
@Component({
  selector: 'app-nueva-ficha',
  imports: [ButtonComponent, DrawerComponent, FilterChipComponent, IconComponent, InputComponent, SelectComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './nueva-ficha.component.html',
})
export class NuevaFichaComponent {
  private readonly servicio = inject(DirectorioService);
  private readonly toast = inject(ToastService);

  readonly creada = output<FichaMedico>();
  readonly cerrar = output<void>();

  protected readonly nombre = signal('');
  protected readonly busquedaPlanilla = signal('');
  private readonly busquedaAplicada = signal('');
  protected readonly medicoId = signal('');
  protected readonly especialidadIds = signal<readonly string[]>([]);
  protected readonly creando = signal(false);

  protected readonly sinFicha = httpResource<RespuestaPaginada<MedicoSinFicha>>(
    () => this.servicio.medicosSinFichaRequest(this.busquedaAplicada()),
    { defaultValue: paginaVacia<MedicoSinFicha>() },
  );
  protected readonly especialidades = httpResource<RespuestaPaginada<Especialidad>>(() => this.servicio.especialidadesActivasRequest(), {
    defaultValue: paginaVacia<Especialidad>(),
  });

  protected readonly falta = computed(() => (this.nombre().trim().length < 3 ? 'Escribe el nombre con que se presenta.' : null));

  constructor() {
    effect(onCleanup => {
      const termino = this.busquedaPlanilla();
      const temporizador = setTimeout(() => this.busquedaAplicada.set(termino.trim()), 300);
      onCleanup(() => clearTimeout(temporizador));
    });
  }

  protected alternarEspecialidad(id: string): void {
    this.especialidadIds.update(ids => (ids.includes(id) ? ids.filter(e => e !== id) : [...ids, id]));
  }

  protected async crear(): Promise<void> {
    if (this.falta() || this.creando()) return;
    this.creando.set(true);
    try {
      const ficha = await this.servicio.crearFicha({
        nombrePublico: this.nombre().trim(),
        ...(this.medicoId() ? { medicoId: this.medicoId() } : {}),
        especialidadIds: [...this.especialidadIds()],
      });
      this.toast.success('Ficha creada: complétala con la foto y el horario, y publícala.');
      this.creada.emit(ficha);
    } catch (error) {
      this.toast.error(mensajeDeError(error, 'No se pudo crear la ficha.'));
    } finally {
      this.creando.set(false);
    }
  }
}
