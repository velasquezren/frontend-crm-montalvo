import { DatePipe } from '@angular/common';
import { HttpClient, httpResource } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { API_URL } from '../../core/api/api.constants';
import { generarIniciales } from '../../core/auth/user.model';
import { Cliente } from '../clientes/cliente.model';
import { AvatarComponent } from '../../shared/components/avatar/avatar.component';
import { BadgeComponent, BadgeVariant } from '../../shared/components/badge/badge.component';
import { ButtonComponent } from '../../shared/components/button/button.component';
import { CardComponent } from '../../shared/components/card/card.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { FilterChipComponent } from '../../shared/components/filter-chip/filter-chip.component';
import { IconComponent, IconName } from '../../shared/components/icon/icon.component';
import { InputComponent } from '../../shared/components/input/input.component';
import { LoadingSkeletonComponent } from '../../shared/components/loading-skeleton/loading-skeleton.component';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { TableComponent } from '../../shared/components/table/table.component';
import { formatearBs, MonedaPipe } from '../../shared/pipes/moneda.pipe';
import { EstadoVenta, Venta } from './venta.model';

type FiltroVenta = EstadoVenta | 'TODAS';

const ESTADO_BADGE: Record<EstadoVenta, BadgeVariant> = {
  GANADA: 'success',
  EN_PROCESO: 'info',
  PERDIDA: 'critical',
};

const ESTADO_LABEL: Record<EstadoVenta, string> = {
  GANADA: 'Ganada',
  EN_PROCESO: 'En proceso',
  PERDIDA: 'Perdida',
};

/**
 * Ventas — datos reales (RF-11/RF-12). El agente que registra queda fijado
 * por el JWT en el servidor; una venta GANADA genera comisión y recategoriza
 * al cliente automáticamente. Un agente ve solo sus ventas; un admin todas.
 */
@Component({
  selector: 'app-ventas',
  imports: [
    PageHeaderComponent,
    CardComponent,
    IconComponent,
    InputComponent,
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
  templateUrl: './ventas.page.html',
})
export class VentasPage {
  private readonly http = inject(HttpClient);

  protected readonly estadoBadge = ESTADO_BADGE;
  protected readonly estadoLabel = ESTADO_LABEL;
  protected readonly iniciales = generarIniciales;

  protected readonly filtro = signal<FiltroVenta>('TODAS');
  protected readonly filtros: readonly FiltroVenta[] = ['TODAS', 'GANADA', 'EN_PROCESO', 'PERDIDA'];

  protected readonly ventas = httpResource<Venta[]>(
    () => {
      const params: Record<string, string> = {};
      if (this.filtro() !== 'TODAS') {
        params['estado'] = this.filtro();
      }
      return { url: `${API_URL}/ventas`, params };
    },
    { defaultValue: [] },
  );

  /* ── Formulario "Registrar venta" ─────────────────────────────── */
  protected readonly formularioAbierto = signal(false);
  protected readonly busquedaCliente = signal('');
  protected readonly clienteElegido = signal<Cliente | null>(null);
  protected readonly producto = signal('');
  protected readonly monto = signal('');
  protected readonly guardando = signal(false);
  protected readonly errorForm = signal('');

  /* Búsqueda de cliente: solo consulta con 2+ caracteres */
  protected readonly resultadosCliente = httpResource<Cliente[]>(
    () => {
      const termino = this.busquedaCliente().trim();
      return termino.length >= 2 && !this.clienteElegido()
        ? { url: `${API_URL}/clientes`, params: { busqueda: termino } }
        : undefined;
    },
    { defaultValue: [] },
  );

  protected readonly resumen = computed(() => {
    const ganadas = this.ventas.value().filter(v => v.estado === 'GANADA');
    const total = ganadas.reduce((suma, v) => suma + Number(v.monto), 0);
    const ticket = ganadas.length > 0 ? Math.round(total / ganadas.length) : 0;

    return [
      { label: 'Total cerrado', valor: formatearBs(total), icon: 'trending-up' as IconName },
      { label: 'Ventas ganadas', valor: String(ganadas.length), icon: 'check-circle' as IconName },
      { label: 'Ticket promedio', valor: formatearBs(ticket), icon: 'shopping-bag' as IconName },
    ];
  });

  protected elegirCliente(cliente: Cliente): void {
    this.clienteElegido.set(cliente);
    this.busquedaCliente.set(cliente.nombre);
  }

  protected limpiarCliente(): void {
    this.clienteElegido.set(null);
    this.busquedaCliente.set('');
  }

  protected async guardar(event: Event): Promise<void> {
    event.preventDefault();
    this.errorForm.set('');

    const cliente = this.clienteElegido();
    const monto = Number(this.monto());
    if (!cliente) {
      this.errorForm.set('Busca y selecciona un cliente.');
      return;
    }
    if (!this.producto().trim()) {
      this.errorForm.set('Indica el producto o servicio vendido.');
      return;
    }
    if (!monto || monto <= 0) {
      this.errorForm.set('Ingresa un monto válido en Bs.');
      return;
    }

    this.guardando.set(true);
    try {
      await firstValueFrom(
        this.http.post(`${API_URL}/ventas`, {
          clienteId: cliente.id,
          producto: this.producto().trim(),
          monto,
        }),
      );
      this.formularioAbierto.set(false);
      this.limpiarCliente();
      this.producto.set('');
      this.monto.set('');
      this.ventas.reload();
    } catch {
      this.errorForm.set('No se pudo registrar la venta. Intenta de nuevo.');
    } finally {
      this.guardando.set(false);
    }
  }
}
