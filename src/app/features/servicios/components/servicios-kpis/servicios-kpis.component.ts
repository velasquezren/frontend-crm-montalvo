import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { CoberturaFicha } from '../../servicios.model';
import { IconComponent, IconName } from '../../../../shared/components/icon/icon.component';
import { InfoHintComponent } from '../../../../shared/components/info-hint/info-hint.component';
import { KpiCardComponent, KpiTono } from '../../../../shared/components/kpi-card/kpi-card.component';

export interface KpiItem {
  label: string;
  /** Número (lo formatea <app-kpi-card>) o texto ya compuesto. */
  valor: string | number;
  icon: IconName;
  tono: KpiTono;
  destacado: boolean;
  pie: string;
}

@Component({
  selector: 'app-servicios-kpis',
  imports: [DecimalPipe, InfoHintComponent, KpiCardComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './servicios-kpis.component.html',
  styleUrl: './servicios-kpis.component.css',
})
export class ServiciosKpisComponent {
  readonly resumen = input.required<ReadonlyArray<KpiItem>>();
  readonly pctCobertura = input.required<number>();
  readonly cobertura = input.required<CoberturaFicha>();
}
