import { DatePipe } from '@angular/common';
import { httpResource } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';

import { mensajeDeError } from '../../core/api/http-error';
import { paginaVacia, RespuestaPaginada } from '../../core/api/pagination.model';
import { generarIniciales } from '../../core/auth/user.model';
import { Cliente } from '../clientes/cliente.model';
import { ClientesService } from '../clientes/clientes.service';
import { AvatarComponent } from '../../shared/components/avatar/avatar.component';
import { BadgeComponent } from '../../shared/components/badge/badge.component';
import { ButtonComponent } from '../../shared/components/button/button.component';
import { CardComponent } from '../../shared/components/card/card.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { FilterChipComponent } from '../../shared/components/filter-chip/filter-chip.component';
import { IconComponent, IconName } from '../../shared/components/icon/icon.component';
import { InputComponent } from '../../shared/components/input/input.component';
import { LoadingSkeletonComponent } from '../../shared/components/loading-skeleton/loading-skeleton.component';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { PaginatorComponent } from '../../shared/components/paginator/paginator.component';
import { TableComponent } from '../../shared/components/table/table.component';
import {
  ESTADO_VENTA_BADGE,
  ESTADO_VENTA_LABEL,
  EstadoVenta,
} from '../../shared/models/estados.model';
import { formatearBs, MonedaPipe } from '../../shared/pipes/moneda.pipe';
import { Venta } from './venta.model';
import { VentasService } from './ventas.service';

type FiltroVenta = EstadoVenta | 'TODAS';

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
    PaginatorComponent,
    MonedaPipe,
    DatePipe,
  ],
  templateUrl: './ventas.page.html',
})
export class VentasPage {
  private readonly ventasService = inject(VentasService);
  private readonly clientesService = inject(ClientesService);

  protected readonly estadoBadge = ESTADO_VENTA_BADGE;
  protected readonly estadoLabel = ESTADO_VENTA_LABEL;
  protected readonly iniciales = generarIniciales;

  protected readonly filtro = signal<FiltroVenta>('TODAS');
  protected readonly filtros: readonly FiltroVenta[] = ['TODAS', 'GANADA', 'EN_PROCESO', 'PERDIDA'];

  protected readonly pagina = signal(1);

  protected readonly ventas = httpResource<RespuestaPaginada<Venta>>(
    () => {
      const filtro = this.filtro();
      return this.ventasService.listarRequest(
        filtro === 'TODAS' ? undefined : filtro,
        this.pagina(),
      );
    },
    { defaultValue: paginaVacia<Venta>() },
  );

  protected cambiarFiltro(nuevo: FiltroVenta): void {
    this.filtro.set(nuevo);
    this.pagina.set(1);
  }

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
        ? this.clientesService.buscarRequest(termino)
        : undefined;
    },
    { defaultValue: [] },
  );

  protected readonly resumen = computed(() => {
    const ganadas = this.ventas.value().datos.filter(v => v.estado === 'GANADA');
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
      await this.ventasService.crear({
        clienteId: cliente.id,
        producto: this.producto().trim(),
        monto,
      });
      this.formularioAbierto.set(false);
      this.limpiarCliente();
      this.producto.set('');
      this.monto.set('');
      this.ventas.reload();
    } catch (err) {
      this.errorForm.set(mensajeDeError(err, 'No se pudo registrar la venta. Intenta de nuevo.'));
    } finally {
      this.guardando.set(false);
    }
  }
}
