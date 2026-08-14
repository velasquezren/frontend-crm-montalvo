import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { httpResource } from '@angular/common/http';

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
import { CATALOGO_VACIO, filtrarMedicos, filtrarServicios, moduloDeServicio } from './catalogo.util';
import { CatalogoClinico, ComprobanteSubido, MetodoPagoVenta, Venta } from './venta.model';
import { VentasService } from './ventas.service';

type FiltroVenta = EstadoVenta | 'TODAS';

export const METODOS_PAGO: readonly { id: MetodoPagoVenta; label: string; icon: IconName }[] = [
  { id: 'QR', label: 'Pago QR', icon: 'dollar-sign' },
  { id: 'TRANSFERENCIA', label: 'Transferencia', icon: 'wallet' },
  { id: 'TARJETA', label: 'Tarjeta Déb./Créd.', icon: 'wallet' },
  { id: 'EFECTIVO', label: 'Efectivo en Caja', icon: 'dollar-sign' },
];

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
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './ventas.page.html',
})
export class VentasPage {
  private readonly ventasService = inject(VentasService);
  private readonly clientesService = inject(ClientesService);

  protected readonly estadoBadge = ESTADO_VENTA_BADGE;
  protected readonly estadoLabel = ESTADO_VENTA_LABEL;
  protected readonly iniciales = generarIniciales;

  protected readonly metodosPago = METODOS_PAGO;

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
  protected readonly metodoPago = signal<MetodoPagoVenta>('QR');
  protected readonly comprobante = signal('');
  protected readonly medico = signal('');
  protected readonly notas = signal('');
  protected readonly guardando = signal(false);
  protected readonly errorForm = signal('');

  /* Adjunto de Comprobante / Recibo */
  protected readonly subiendoComprobante = signal(false);
  protected readonly comprobanteSubido = signal<ComprobanteSubido | null>(null);
  protected readonly archivoNombre = signal<string | null>(null);

  /* Lightbox visor de comprobante */
  protected readonly lightboxUrl = signal<string | null>(null);
  protected readonly lightboxNombre = signal<string | null>(null);

  /**
   * Catálogo real de la clínica. Se pide al abrir el formulario y no antes: no
   * tiene sentido cargarlo al entrar al listado, que es lo que la agente hace
   * más veces.
   */
  protected readonly catalogo = httpResource<CatalogoClinico>(
    () => (this.formularioAbierto() ? this.ventasService.catalogoRequest() : undefined),
    { defaultValue: CATALOGO_VACIO },
  );

  /**
   * Servicios que coinciden con lo tecleado, los más vendidos primero.
   *
   * Sin texto muestra los diez más frecuentes, que es lo que resuelve la mayoría
   * de los registros sin escribir nada: consulta externa, hemograma, ecografía.
   */
  protected readonly serviciosSugeridos = computed(() =>
    filtrarServicios(this.catalogo.value(), this.producto()),
  );

  /**
   * El módulo ya no lo elige nadie: sale del servicio elegido.
   *
   * Antes había un selector de ocho "especialidades" escrito a mano que no
   * existía en FileMaker. Los módulos de verdad son cuatro y son operativos
   * —LABORATORIO, CONSULTA, PLANES, INTERNACION—, además de ser entrada del
   * motor de comisiones. Deducirlos del servicio quita un clic y hace que lo
   * guardado venga del dato, no de lo que alguien supuso.
   */
  protected readonly moduloDetectado = computed(() =>
    moduloDeServicio(this.catalogo.value(), this.producto()),
  );

  protected readonly medicosSugeridos = computed(() =>
    filtrarMedicos(this.catalogo.value(), this.medico()),
  );

  /* Búsqueda de cliente: solo consulta con 2+ caracteres */
  protected readonly resultadosCliente = httpResource<readonly Cliente[]>(
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

  protected seleccionarSugerencia(nombreServicio: string): void {
    this.producto.set(nombreServicio);
  }

  protected async onArchivoSeleccionado(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    const file = input.files[0];
    this.archivoNombre.set(file.name);
    this.subiendoComprobante.set(true);
    this.errorForm.set('');

    try {
      const res = await this.ventasService.subirComprobante(file);
      this.comprobanteSubido.set(res);
    } catch (err) {
      this.errorForm.set(mensajeDeError(err, 'No se pudo subir el archivo de comprobante'));
      this.archivoNombre.set(null);
      this.comprobanteSubido.set(null);
    } finally {
      this.subiendoComprobante.set(false);
    }
  }

  protected quitarComprobante(): void {
    this.archivoNombre.set(null);
    this.comprobanteSubido.set(null);
  }

  protected abrirLightbox(url: string, nombre?: string | null): void {
    this.lightboxUrl.set(url);
    this.lightboxNombre.set(nombre || 'Comprobante de pago');
  }

  protected cerrarLightbox(): void {
    this.lightboxUrl.set(null);
    this.lightboxNombre.set(null);
  }

  protected async guardar(event: Event): Promise<void> {
    event.preventDefault();
    this.errorForm.set('');

    const cliente = this.clienteElegido();
    const monto = Number(this.monto());
    if (!cliente) {
      this.errorForm.set('Busca y selecciona un cliente o paciente.');
      return;
    }
    if (!this.producto().trim()) {
      this.errorForm.set('Indica el producto, procedimiento o servicio vendido.');
      return;
    }
    if (!monto || monto <= 0) {
      this.errorForm.set('Ingresa un monto válido en Bs.');
      return;
    }

    const subido = this.comprobanteSubido();

    this.guardando.set(true);
    try {
      await this.ventasService.crear({
        clienteId: cliente.id,
        producto: this.producto().trim(),
        monto,
        metodoPago: this.metodoPago(),
        comprobante: this.comprobante().trim() || undefined,
        comprobanteKey: subido?.comprobanteKey,
        comprobanteMime: subido?.comprobanteMime,
        comprobanteNombre: subido?.comprobanteNombre,
        medico: this.medico().trim() || undefined,
        /* Sale del catálogo, o sea de FileMaker. Si la agente escribió un
           servicio que aún no existe en el histórico, va vacío en vez de
           inventar una categoría. */
        modulo: this.moduloDetectado() || undefined,
        notas: this.notas().trim() || undefined,
      });

      this.formularioAbierto.set(false);
      this.limpiarCliente();
      this.producto.set('');
      this.monto.set('');
      this.comprobante.set('');
      this.medico.set('');
      this.notas.set('');
      this.quitarComprobante();
      this.ventas.reload();
    } catch (err) {
      this.errorForm.set(mensajeDeError(err, 'No se pudo registrar la venta. Intenta de nuevo.'));
    } finally {
      this.guardando.set(false);
    }
  }
}
