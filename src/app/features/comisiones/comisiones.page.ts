import { DatePipe } from '@angular/common';
import { HttpClient, httpResource } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { API_URL } from '../../core/api/api.constants';
import { AuthService } from '../../core/auth/auth.service';
import { generarIniciales } from '../../core/auth/user.model';
import { AvatarComponent } from '../../shared/components/avatar/avatar.component';
import { BadgeComponent, BadgeVariant } from '../../shared/components/badge/badge.component';
import { ButtonComponent } from '../../shared/components/button/button.component';
import { CardComponent } from '../../shared/components/card/card.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { FilterChipComponent } from '../../shared/components/filter-chip/filter-chip.component';
import { IconComponent, IconName } from '../../shared/components/icon/icon.component';
import { LoadingSkeletonComponent } from '../../shared/components/loading-skeleton/loading-skeleton.component';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { TableComponent } from '../../shared/components/table/table.component';
import { formatearBs, MonedaPipe } from '../../shared/pipes/moneda.pipe';
import { Comision, EstadoComision } from './comision.model';

type FiltroComision = EstadoComision | 'TODAS';

const ESTADO_BADGE: Record<EstadoComision, BadgeVariant> = {
  PAGADA: 'success',
  PENDIENTE: 'info',
};

const ESTADO_LABEL: Record<EstadoComision, string> = {
  PAGADA: 'Pagada',
  PENDIENTE: 'Pendiente',
};

/**
 * Comisiones — datos reales (RF-14/RF-15). El backend limita a un agente
 * a ver solo las suyas. Marcar como pagada es exclusivo de ADMIN (botón
 * oculto para agentes; el backend además lo bloquea con @Roles).
 */
@Component({
  selector: 'app-comisiones',
  imports: [
    PageHeaderComponent,
    CardComponent,
    IconComponent,
    ButtonComponent,
    FilterChipComponent,
    TableComponent,
    AvatarComponent,
    BadgeComponent,
    EmptyStateComponent,
    LoadingSkeletonComponent,
    MonedaPipe,
    DatePipe,
  ],
  templateUrl: './comisiones.page.html',
})
export class ComisionesPage {
  private readonly http = inject(HttpClient);
  private readonly authService = inject(AuthService);

  protected readonly estadoBadge = ESTADO_BADGE;
  protected readonly estadoLabel = ESTADO_LABEL;
  protected readonly iniciales = generarIniciales;
  protected readonly esAdmin = this.authService.isAdmin;

  protected readonly filtro = signal<FiltroComision>('TODAS');
  protected readonly filtros: readonly FiltroComision[] = ['TODAS', 'PENDIENTE', 'PAGADA'];
  protected readonly pagandoId = signal<string | null>(null);

  protected readonly comisiones = httpResource<Comision[]>(
    () => {
      const params: Record<string, string> = {};
      if (this.filtro() !== 'TODAS') {
        params['estado'] = this.filtro();
      }
      return { url: `${API_URL}/comisiones`, params };
    },
    { defaultValue: [] },
  );

  protected readonly filtradas = computed(() => this.comisiones.value());

  protected readonly resumen = computed(() => {
    const lista = this.comisiones.value();
    const total = lista.reduce((s, c) => s + Number(c.monto), 0);
    const pendiente = lista
      .filter(c => c.estado === 'PENDIENTE')
      .reduce((s, c) => s + Number(c.monto), 0);

    return [
      { label: 'Comisiones generadas', valor: formatearBs(total), icon: 'wallet' as IconName },
      { label: 'Pendientes de pago', valor: formatearBs(pendiente), icon: 'clock' as IconName },
      { label: 'Pagadas', valor: formatearBs(total - pendiente), icon: 'check-circle' as IconName },
    ];
  });

  protected contarPor(opcion: FiltroComision): number {
    const lista = this.comisiones.value();
    if (opcion === 'TODAS') return lista.length;
    return lista.filter(c => c.estado === opcion).length;
  }

  protected async pagar(id: string): Promise<void> {
    this.pagandoId.set(id);
    try {
      await firstValueFrom(this.http.post(`${API_URL}/comisiones/${id}/pagar`, {}));
      this.comisiones.reload();
    } finally {
      this.pagandoId.set(null);
    }
  }
}
