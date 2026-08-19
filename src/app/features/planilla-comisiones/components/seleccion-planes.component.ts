import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import { BadgeComponent } from '../../../shared/components/badge/badge.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { InfoHintComponent } from '../../../shared/components/info-hint/info-hint.component';
import { LoadingSkeletonComponent } from '../../../shared/components/loading-skeleton/loading-skeleton.component';
import { GrupoPlanes, VentaImportada } from '../planilla.model';

/**
 * Componente para auditar y decidir qué planes y paquetes comisionan en el mes.
 *
 * El objetivo de planes funciona como FRANQUICIA: solo comisionan los planes
 * que superan la meta (vendidos − objetivo). El sistema elige por defecto los de
 * menor base de cálculo, pero el usuario puede pulsar cualquier plan para
 * forzarlo a comisionar o excluirlo a mano.
 */
@Component({
  selector: 'app-seleccion-planes',
  imports: [
    DecimalPipe,
    BadgeComponent,
    EmptyStateComponent,
    IconComponent,
    InfoHintComponent,
    LoadingSkeletonComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './seleccion-planes.component.html',
  styleUrl: './seleccion-planes.component.css',
})
export class SeleccionPlanesComponent {
  readonly grupos = input<readonly GrupoPlanes[]>([]);
  readonly cargando = input(false);
  readonly error = input<unknown>(null);
  readonly esSuperAdmin = input(false);

  readonly planAlternado = output<VentaImportada>();
}
