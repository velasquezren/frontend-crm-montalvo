import { DecimalPipe } from '@angular/common';
import { HttpErrorResponse, httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';

import { FechaClinicaPipe } from '../../../../core/fechas/fecha-clinica.pipe';
import { EmptyStateComponent } from '../../../../shared/components/empty-state/empty-state.component';
import { ErrorCargaComponent } from '../../../../shared/components/error-carga/error-carga.component';
import { IconComponent } from '../../../../shared/components/icon/icon.component';
import { LoadingSkeletonComponent } from '../../../../shared/components/loading-skeleton/loading-skeleton.component';
import { MonedaPipe } from '../../../../shared/pipes/moneda.pipe';
import { PerfilMedico } from '../../../servicios/servicios.model';
import { ServiciosService } from '../../../servicios/servicios.service';

/** Cuántos servicios frecuentes se muestran aquí; el perfil completo está en el Historial de servicios. */
const SERVICIOS_A_MOSTRAR = 5;

/**
 * Lo que hizo un médico según el historial de servicios (el Excel mensual de
 * FileMaker), en su ficha del Directorio. Une los dos lados por el código de
 * FileMaker, que es el mismo en la agenda y en el Excel. Solo administración:
 * es la misma información que el Historial de servicios, que también lo es.
 *
 * Un 404 no es un error: es un médico sin servicios cargados (nuevo, o que
 * nunca atendió con ese código).
 */
@Component({
  selector: 'app-agenda-medico-servicios',
  imports: [DecimalPipe, EmptyStateComponent, ErrorCargaComponent, FechaClinicaPipe, IconComponent, LoadingSkeletonComponent, MonedaPipe, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './agenda-medico-servicios.component.html',
  /* Columna que encoge: sin esto su cuerpo `flex-1 overflow-y-auto` no desplaza y el cajón corta el final. */
  host: { class: 'flex-1 min-h-0 flex flex-col' },
})
export class AgendaMedicoServiciosComponent {
  private readonly servicios = inject(ServiciosService);

  /** Código de FileMaker del médico. */
  readonly codigo = input.required<string>();
  /** Al ir al Historial de servicios, la ficha se cierra. */
  readonly salir = output<void>();

  protected readonly recurso = httpResource<PerfilMedico>(() => this.servicios.perfilMedicoRequest(this.codigo()));

  protected readonly sinServicios = computed(() => {
    const error = this.recurso.error();
    return error instanceof HttpErrorResponse && error.status === 404;
  });

  protected readonly perfil = computed(() => (this.recurso.hasValue() ? this.recurso.value() : null));
  protected readonly frecuentes = computed(() => (this.perfil()?.topServicios ?? []).slice(0, SERVICIOS_A_MOSTRAR));
}
