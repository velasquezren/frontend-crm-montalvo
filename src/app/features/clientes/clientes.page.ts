import { httpResource } from '@angular/common/http';
import { Component, effect, signal } from '@angular/core';
import { DatePipe } from '@angular/common';

import { API_URL } from '../../core/api/api.constants';
import { generarIniciales } from '../../core/auth/user.model';
import { AvatarComponent } from '../../shared/components/avatar/avatar.component';
import { BadgeComponent } from '../../shared/components/badge/badge.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { FilterChipComponent } from '../../shared/components/filter-chip/filter-chip.component';
import { InputComponent } from '../../shared/components/input/input.component';
import { LoadingSkeletonComponent } from '../../shared/components/loading-skeleton/loading-skeleton.component';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { TableComponent } from '../../shared/components/table/table.component';
import {
  CATEGORIA_BADGE,
  CATEGORIA_ICON,
  CATEGORIA_LABEL,
  CategoriaCliente,
} from '../../shared/models/cliente-categoria.model';
import { Cliente } from './cliente.model';

type FiltroCategoria = CategoriaCliente | 'TODOS';

/**
 * Clientes — listado real desde GET /clientes (RF-01/RF-03/RF-24).
 * El backend ya aplica visibilidad por rol: un agente ve sus clientes + pool sin asignar.
 */
@Component({
  selector: 'app-clientes',
  imports: [
    PageHeaderComponent,
    InputComponent,
    FilterChipComponent,
    TableComponent,
    AvatarComponent,
    BadgeComponent,
    EmptyStateComponent,
    LoadingSkeletonComponent,
    DatePipe,
  ],
  templateUrl: './clientes.page.html',
})
export class ClientesPage {
  protected readonly categoriaLabel = CATEGORIA_LABEL;
  protected readonly categoriaBadge = CATEGORIA_BADGE;
  protected readonly categoriaIcon = CATEGORIA_ICON;
  protected readonly iniciales = generarIniciales;

  protected readonly busqueda = signal('');
  protected readonly filtro = signal<FiltroCategoria>('TODOS');

  /* Búsqueda con debounce de 300ms para no disparar una petición por tecla */
  private readonly busquedaAplicada = signal('');

  protected readonly filtros: readonly FiltroCategoria[] = [
    'TODOS',
    'GOLD',
    'SILVER',
    'BRONZE',
    'PROSPECTO',
  ];

  protected readonly clientes = httpResource<Cliente[]>(
    () => ({
      url: `${API_URL}/clientes`,
      params: {
        ...(this.busquedaAplicada() ? { busqueda: this.busquedaAplicada() } : {}),
        ...(this.filtro() !== 'TODOS' ? { categoria: this.filtro() } : {}),
      },
    }),
    { defaultValue: [] },
  );

  constructor() {
    let timeout: ReturnType<typeof setTimeout>;
    effect(() => {
      const termino = this.busqueda();
      clearTimeout(timeout);
      timeout = setTimeout(() => this.busquedaAplicada.set(termino.trim()), 300);
    });
  }
}
