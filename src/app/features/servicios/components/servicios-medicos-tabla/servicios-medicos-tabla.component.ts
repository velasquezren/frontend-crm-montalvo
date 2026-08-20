import { DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import { RespuestaPaginada } from '../../../../core/api/pagination.model';
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
import { MedicoConServicios } from '../../servicios.model';

@Component({
  selector: 'app-servicios-medicos-tabla',
  imports: [
    DatePipe,
    DecimalPipe,
    MonedaPipe,
    EmptyStateComponent,
    InputComponent,
    ThOrdenableComponent,
    LoadingSkeletonComponent,
    PaginatorComponent,
    TableComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './servicios-medicos-tabla.component.html',
  styleUrl: './servicios-medicos-tabla.component.css',
})
export class ServiciosMedicosTablaComponent {
  readonly medicos = input.required<RespuestaPaginada<MedicoConServicios>>();
  readonly isLoading = input<boolean>(false);
  readonly error = input<unknown>(null);

  readonly busqueda = input<string>('');
  readonly busquedaChange = output<string>();

  readonly paginaChange = output<number>();

  /** Orden vigente; lo decide la página, que es quien pide los datos. */
  readonly orden = input<string | undefined>(undefined);
  readonly direccion = input<DireccionOrden>('asc');
  readonly ordenar = output<{ orden: string; direccion: DireccionOrden }>();
  /** Abre el perfil del médico. Emite el código, no el nombre: es la clave. */
  readonly abrirMedico = output<string>();

  protected onBusquedaInput(val: string): void {
    this.busquedaChange.emit(val);
  }

  protected iniciales(nombre: string | null): string {
    if (!nombre) return 'Dr';
    const limpio = nombre.replace(/^Dr\.\s*|^Dra\.\s*/i, '').trim();
    const partes = limpio.split(/\s+/).filter(Boolean);
    if (partes.length >= 2) {
      return (partes[0][0] + partes[1][0]).toUpperCase();
    }
    return (partes[0]?.[0] || 'D').toUpperCase();
  }
}
