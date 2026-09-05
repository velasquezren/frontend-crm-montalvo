import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import { DrawerComponent } from '../../../../shared/components/drawer/drawer.component';
import { EmptyStateComponent } from '../../../../shared/components/empty-state/empty-state.component';
import { IconComponent } from '../../../../shared/components/icon/icon.component';
import { KpiCardComponent } from '../../../../shared/components/kpi-card/kpi-card.component';
import { LoadingSkeletonComponent } from '../../../../shared/components/loading-skeleton/loading-skeleton.component';
import { TimelineComponent } from '../../../../shared/components/timeline/timeline.component';
import { MonedaPipe } from '../../../../shared/pipes/moneda.pipe';
import { KpiItem } from '../servicios-kpis/servicios-kpis.component';
import { HistorialPaciente } from '../../servicios.model';

@Component({
  selector: 'app-servicios-historial-drawer',
  imports: [
    DatePipe,
    MonedaPipe,
    DrawerComponent,
    EmptyStateComponent,
    IconComponent,
    KpiCardComponent,
    LoadingSkeletonComponent,
    TimelineComponent,
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
  readonly verMedico = output<string>();

  /**
   * La línea de tiempo, agrupada por año y con el gasto de cada uno.
   *
   * Un historial clínico se lee por épocas —"el año que se operó", "cuando vino
   * seguido"—, no como una lista plana de cincuenta filas iguales. Agrupar da
   * puntos de referencia al recorrerlo, y el total por año responde de un
   * vistazo la pregunta que siempre se hace: cuánto dejó y cuándo.
   *
   * Los servicios llegan ya ordenados del backend; aquí solo se parten, así que
   * el orden de los grupos es el mismo que traía la lista.
   */
  protected readonly porAnio = computed(() => {
    const grupos = new Map<string, { anio: string; servicios: HistorialPaciente['servicios']; total: number }>();

    for (const s of this.historial().servicios) {
      /* Sin fecha van juntos al final en su propio grupo: el Excel no siempre
         la trae, y esconderlos sería perder servicios que sí ocurrieron. */
      const anio = s.fecha ? String(new Date(s.fecha).getFullYear()) : 'Sin fecha';
      const grupo = grupos.get(anio) ?? { anio, servicios: [], total: 0 };
      grupo.servicios.push(s);
      grupo.total += Number(s.precio) || 0;
      grupos.set(anio, grupo);
    }

    return [...grupos.values()];
  });
}
