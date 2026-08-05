import { DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { EmptyStateComponent } from '../../../../shared/components/empty-state/empty-state.component';
import { IconComponent } from '../../../../shared/components/icon/icon.component';
import { KpiCardComponent } from '../../../../shared/components/kpi-card/kpi-card.component';
import { formatearBs, MonedaPipe } from '../../../../shared/pipes/moneda.pipe';
import { PerfilMedico } from '../../servicios.model';
import { KpiItem } from '../servicios-kpis/servicios-kpis.component';

const MESES = [
  'ene', 'feb', 'mar', 'abr', 'may', 'jun',
  'jul', 'ago', 'sep', 'oct', 'nov', 'dic',
];

/**
 * Perfil de un médico — espejo del cajón del historial del paciente.
 *
 * Los KPI se derivan aquí y no en la página: son propios de esta vista y no los
 * consume nadie más. El resto del contenido llega ya agregado por el backend,
 * así que este componente solo presenta.
 */
@Component({
  selector: 'app-servicios-medico-drawer',
  imports: [
    DatePipe,
    DecimalPipe,
    MonedaPipe,
    ButtonComponent,
    EmptyStateComponent,
    IconComponent,
    KpiCardComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './servicios-medico-drawer.component.html',
  styleUrl: './servicios-medico-drawer.component.css',
})
export class ServiciosMedicoDrawerComponent {
  readonly perfil = input.required<PerfilMedico>();

  readonly cerrar = output<void>();
  /** Abre el historial de uno de sus pacientes, sin salir de la vista. */
  readonly verPaciente = output<string>();

  protected readonly resumen = computed<ReadonlyArray<KpiItem>>(() => {
    const r = this.perfil().resumen;
    return [
      {
        label: 'Servicios',
        valor: String(r.servicios),
        icon: 'activity' as const,
        tono: 'secondary' as const,
        destacado: false,
        pie: '',
      },
      {
        label: 'Pacientes',
        valor: String(r.pacientes),
        icon: 'users' as const,
        tono: 'neutral' as const,
        destacado: false,
        pie: 'distintos',
      },
      {
        label: 'Facturado',
        valor: formatearBs(r.ingreso),
        icon: 'wallet' as const,
        tono: 'primary' as const,
        destacado: true,
        pie: `${formatearBs(r.ticketPromedio)} por servicio`,
      },
    ];
  });

  /**
   * Evolución mensual como barras proporcionales al mes más alto. Se resuelve
   * con un ancho porcentual en vez de con un componente de gráfico: son pocas
   * barras dentro de un cajón, y `<app-bar-chart>` traería ejes y leyenda que
   * aquí sobran.
   */
  protected readonly meses = computed(() => {
    const filas = this.perfil().porMes;
    const techo = Math.max(...filas.map(f => f.total), 1);
    return filas.map(f => ({
      etiqueta: `${MESES[f.mes - 1] ?? '—'} ${String(f.anio).slice(2)}`,
      total: f.total,
      ingreso: f.ingreso,
      porcentaje: Math.round((f.total / techo) * 100),
    }));
  });

  /** Cuánto pesa cada módulo sobre el total del médico. */
  protected readonly modulos = computed(() => {
    const total = this.perfil().resumen.servicios || 1;
    return this.perfil().porModulo.map(m => ({
      ...m,
      porcentaje: Math.round((m.total / total) * 100),
    }));
  });
}
