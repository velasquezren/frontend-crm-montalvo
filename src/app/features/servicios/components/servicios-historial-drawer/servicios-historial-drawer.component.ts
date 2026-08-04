import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { EmptyStateComponent } from '../../../../shared/components/empty-state/empty-state.component';
import { IconComponent } from '../../../../shared/components/icon/icon.component';
import { MonedaPipe } from '../../../../shared/pipes/moneda.pipe';
import { KpiItem } from '../servicios-kpis/servicios-kpis.component';
import { HistorialPaciente } from '../../servicios.model';

@Component({
  selector: 'app-servicios-historial-drawer',
  imports: [DatePipe, MonedaPipe, ButtonComponent, EmptyStateComponent, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './servicios-historial-drawer.component.html',
  styleUrl: './servicios-historial-drawer.component.css',
})
export class ServiciosHistorialDrawerComponent {
  readonly historial = input.required<HistorialPaciente>();
  readonly resumenHistorial = input.required<ReadonlyArray<KpiItem>>();

  readonly cerrar = output<void>();
}
