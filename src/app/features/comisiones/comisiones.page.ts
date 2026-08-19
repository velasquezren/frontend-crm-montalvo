import { DatePipe } from '@angular/common';
import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';

import { mensajeDeError } from '../../core/api/http-error';
import { paginaVacia, RespuestaPaginada } from '../../core/api/pagination.model';
import { AuthService } from '../../core/auth/auth.service';
import { ToastService } from '../../core/toast/toast.service';
import { generarIniciales } from '../../core/auth/user.model';
import { AvatarComponent } from '../../shared/components/avatar/avatar.component';
import { BadgeComponent } from '../../shared/components/badge/badge.component';
import { ButtonComponent } from '../../shared/components/button/button.component';
import { CardComponent } from '../../shared/components/card/card.component';
import { ErrorCargaComponent } from '../../shared/components/error-carga/error-carga.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { FilterChipComponent } from '../../shared/components/filter-chip/filter-chip.component';
import { IconComponent, IconName } from '../../shared/components/icon/icon.component';
import { LoadingSkeletonComponent } from '../../shared/components/loading-skeleton/loading-skeleton.component';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { PaginatorComponent } from '../../shared/components/paginator/paginator.component';
import { TableComponent } from '../../shared/components/table/table.component';
import {
  ESTADO_COMISION_BADGE,
  ESTADO_COMISION_LABEL,
  EstadoComision,
} from '../../shared/models/estados.model';
import { MonedaService } from '../../core/moneda/moneda.service';
import { MonedaPipe } from '../../shared/pipes/moneda.pipe';
import { Comision } from './comision.model';
import { ComisionesService } from './comisiones.service';

type FiltroComision = EstadoComision | 'TODAS';


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
    ErrorCargaComponent,
    LoadingSkeletonComponent,
    PaginatorComponent,
    MonedaPipe,
    DatePipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './comisiones.page.html',
})
export class ComisionesPage {
  /* Los KPI se formatean con el servicio y no con `formatearBs`, que imprimía
     siempre "Bs": leer aquí la señal de moneda hace que este computed se
     recalcule al pulsar el selector, y así las tarjetas dejan de contradecir a
     la tabla que tienen debajo. */
  private readonly moneda = inject(MonedaService);

  private readonly comisionesService = inject(ComisionesService);
  private readonly authService = inject(AuthService);
  private readonly toast = inject(ToastService);

  protected readonly estadoBadge = ESTADO_COMISION_BADGE;
  protected readonly estadoLabel = ESTADO_COMISION_LABEL;
  protected readonly iniciales = generarIniciales;
  protected readonly esAdmin = this.authService.isAdmin;

  protected readonly filtro = signal<FiltroComision>('TODAS');
  protected readonly filtros: readonly FiltroComision[] = ['TODAS', 'PENDIENTE', 'PAGADA'];
  protected readonly pagandoId = signal<string | null>(null);

  protected readonly pagina = signal(1);

  protected readonly comisiones = httpResource<RespuestaPaginada<Comision>>(
    () => {
      const filtro = this.filtro();
      return this.comisionesService.listarRequest(
        filtro === 'TODAS' ? undefined : filtro,
        this.pagina(),
      );
    },
    { defaultValue: paginaVacia<Comision>() },
  );

  protected cambiarFiltro(nuevo: FiltroComision): void {
    this.filtro.set(nuevo);
    this.pagina.set(1);
  }

  protected readonly filtradas = computed(() => this.comisiones.value().datos);

  protected readonly resumen = computed(() => {
    const lista = this.comisiones.value().datos;
    const total = lista.reduce((s, c) => s + Number(c.monto), 0);
    const pendiente = lista
      .filter(c => c.estado === 'PENDIENTE')
      .reduce((s, c) => s + Number(c.monto), 0);

    return [
      { label: 'Comisiones generadas', valor: this.moneda.formatearBob(total), icon: 'wallet' as IconName },
      { label: 'Pendientes de pago', valor: this.moneda.formatearBob(pendiente), icon: 'clock' as IconName },
      { label: 'Pagadas', valor: this.moneda.formatearBob(total - pendiente), icon: 'check-circle' as IconName },
    ];
  });

  protected contarPor(opcion: FiltroComision): number {
    const lista = this.comisiones.value().datos;
    if (opcion === 'TODAS') return lista.length;
    return lista.filter(c => c.estado === opcion).length;
  }

  protected async pagar(id: string): Promise<void> {
    this.pagandoId.set(id);
    try {
      await this.comisionesService.marcarPagada(id);
      this.toast.success('Comisión marcada como pagada', 'Listo');
      this.comisiones.reload();
    } catch (err) {
      this.toast.error(
        mensajeDeError(err, 'No se pudo marcar la comisión como pagada.'),
        'Error',
      );
    } finally {
      this.pagandoId.set(null);
    }
  }
}
