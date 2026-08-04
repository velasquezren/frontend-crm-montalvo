import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import { BadgeComponent } from '../../../../shared/components/badge/badge.component';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { ChartItem } from '../../../../shared/components/charts/bar-chart.component';
import { DonutChartComponent } from '../../../../shared/components/charts/donut-chart.component';
import { MonedaPipe } from '../../../../shared/pipes/moneda.pipe';

export interface DesgloseModuloItem {
  etiqueta: string;
  total: number;
  ingreso: number;
  pct: number;
}

@Component({
  selector: 'app-servicios-modulos',
  imports: [DecimalPipe, MonedaPipe, BadgeComponent, ButtonComponent, DonutChartComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './servicios-modulos.component.html',
  styleUrl: './servicios-modulos.component.css',
})
export class ServiciosModulosComponent {
  readonly serieModulos = input.required<ChartItem[]>();
  readonly desgloseModulos = input.required<ReadonlyArray<DesgloseModuloItem>>();
  readonly filtroModulo = input<string | null>(null);

  readonly alternarModulo = output<string>();
}
