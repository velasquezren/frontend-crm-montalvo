import { DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import { RespuestaPaginada } from '../../../../core/api/pagination.model';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { EmptyStateComponent } from '../../../../shared/components/empty-state/empty-state.component';
import { InputComponent } from '../../../../shared/components/input/input.component';
import {
  DireccionOrden,
  ThOrdenableComponent,
} from '../../../../shared/components/table/th-ordenable.component';
import { LoadingSkeletonComponent } from '../../../../shared/components/loading-skeleton/loading-skeleton.component';
import { PaginatorComponent } from '../../../../shared/components/paginator/paginator.component';
import { TableComponent } from '../../../../shared/components/table/table.component';
import { MonedaPipe } from '../../../../shared/pipes/moneda.pipe';
import { PacienteConServicios } from '../../servicios.model';

@Component({
  selector: 'app-servicios-pacientes-tabla',
  imports: [
    DatePipe,
    DecimalPipe,
    MonedaPipe,
    ButtonComponent,
    EmptyStateComponent,
    InputComponent,
    ThOrdenableComponent,
    LoadingSkeletonComponent,
    PaginatorComponent,
    TableComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './servicios-pacientes-tabla.component.html',
  styleUrl: './servicios-pacientes-tabla.component.css',
})
export class ServiciosPacientesTablaComponent {
  readonly pacientes = input.required<RespuestaPaginada<PacienteConServicios>>();
  readonly isLoading = input<boolean>(false);
  readonly error = input<unknown>(null);

  /** Enlaza bidireccionalmente con la señal del padre a través de busquedaChange */
  readonly busqueda = input<string>('');
  readonly busquedaChange = output<string>();

  readonly paginaChange = output<number>();

  /** Orden vigente; lo decide la página, que es quien pide los datos. */
  readonly orden = input<string | undefined>(undefined);
  readonly direccion = input<DireccionOrden>('asc');
  readonly ordenar = output<{ orden: string; direccion: DireccionOrden }>();
  readonly abrirHistorial = output<string | null>();

  protected onBusquedaInput(val: string): void {
    this.busquedaChange.emit(val);
  }

  protected iniciales(nombre: string | null): string {
    if (!nombre) return 'P';
    const partes = nombre.trim().split(/\s+/).filter(Boolean);
    if (partes.length >= 2) {
      return (partes[0][0] + partes[1][0]).toUpperCase();
    }
    return (partes[0]?.[0] || 'P').toUpperCase();
  }
}
