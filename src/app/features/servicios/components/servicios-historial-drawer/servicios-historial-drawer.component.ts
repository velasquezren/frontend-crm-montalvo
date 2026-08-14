import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { EmptyStateComponent } from '../../../../shared/components/empty-state/empty-state.component';
import { IconComponent } from '../../../../shared/components/icon/icon.component';
import { KpiCardComponent } from '../../../../shared/components/kpi-card/kpi-card.component';
import { LoadingSkeletonComponent } from '../../../../shared/components/loading-skeleton/loading-skeleton.component';
import { MonedaPipe } from '../../../../shared/pipes/moneda.pipe';
import { KpiItem } from '../servicios-kpis/servicios-kpis.component';
import { HistorialPaciente } from '../../servicios.model';

@Component({
  selector: 'app-servicios-historial-drawer',
  imports: [
    DatePipe,
    MonedaPipe,
    ButtonComponent,
    EmptyStateComponent,
    IconComponent,
    KpiCardComponent,
    LoadingSkeletonComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './servicios-historial-drawer.component.html',
  styleUrl: './servicios-historial-drawer.component.css',
})
export class ServiciosHistorialDrawerComponent {
  readonly historial = input.required<HistorialPaciente>();
  readonly resumenHistorial = input.required<ReadonlyArray<KpiItem>>();

  /**
   * El cajón se abre ANTES de que responda el servidor, con lo que la tabla ya
   * tenía cargado (nombre, código, nº de servicios y gastado). Mientras llega el
   * resto, la línea de tiempo muestra esqueleto.
   *
   * Sin esta bandera caería en el `@empty` y afirmaría "Sin servicios
   * registrados" durante el viaje de ida y vuelta — que no es un hueco, es una
   * mentira: el paciente sí tiene servicios y por eso está en la tabla.
   */
  readonly cargando = input<boolean>(false);

  readonly cerrar = output<void>();
}
