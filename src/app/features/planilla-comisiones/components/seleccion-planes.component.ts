import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import { BadgeComponent } from '../../../shared/components/badge/badge.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { ErrorCargaComponent } from '../../../shared/components/error-carga/error-carga.component';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { InfoHintComponent } from '../../../shared/components/info-hint/info-hint.component';
import { LoadingSkeletonComponent } from '../../../shared/components/loading-skeleton/loading-skeleton.component';
import { MonedaPipe } from '../../../shared/pipes/moneda.pipe';
import { GrupoPlanes, VentaImportada } from '../planilla.model';

/**
 * Componente para auditar y decidir qué planes y paquetes comisionan en el mes.
 *
 * El objetivo de planes funciona como FRANQUICIA: solo comisionan los planes
 * que superan la meta (vendidos − objetivo), y los que comisionan son los
 * ÚLTIMOS vendidos. El usuario puede pulsar cualquier plan para forzarlo a
 * comisionar o excluirlo a mano.
 *
 * La lista llega ya ordenada del último al primero: ese orden ES la regla, así
 * que se muestra numerado y con el correlativo de registro a la vista. Sin eso,
 * "comisionan 2 de 8" obliga a creer en el sistema en vez de poder comprobarlo.
 */
@Component({
  selector: 'app-seleccion-planes',
  imports: [
    DatePipe,
    MonedaPipe,
    BadgeComponent,
    EmptyStateComponent,
    ErrorCargaComponent,
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
  /**
   * Si el periodo todavía admite cambios (espejo de `periodoEditable()` de la
   * página). Sin esto, un SUPER_ADMIN podía seguir forzando planes en un mes
   * ya CERRADO o PAGADO: el botón solo miraba el rol, nunca el estado, y el
   * backend terminaba rechazando con 409 lo que aquí parecía haber funcionado.
   */
  readonly editable = input(true);

  readonly planAlternado = output<VentaImportada>();
}
