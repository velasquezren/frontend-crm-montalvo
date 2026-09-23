import { DatePipe } from '@angular/common';
import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';

import { mensajeDeError } from '../../../core/api/http-error';
import { paginaVacia, RespuestaPaginada } from '../../../core/api/pagination.model';
import { MonedaService } from '../../../core/moneda/moneda.service';
import { AvatarComponent } from '../../../shared/components/avatar/avatar.component';
import { BadgeComponent } from '../../../shared/components/badge/badge.component';
import { ButtonComponent } from '../../../shared/components/button/button.component';
import { DrawerComponent } from '../../../shared/components/drawer/drawer.component';
import { FilterChipComponent } from '../../../shared/components/filter-chip/filter-chip.component';
import { IconComponent, IconName } from '../../../shared/components/icon/icon.component';
import { InputComponent } from '../../../shared/components/input/input.component';
import { InicialesClientePipe, NombreClientePipe } from '../../../shared/pipes/nombre-cliente.pipe';
import { Cliente } from '../../clientes/cliente.model';
import { ClientesService } from '../../clientes/clientes.service';
import { Lead, ORIGEN_LABEL } from '../../leads/lead.model';
import { LeadsService } from '../../leads/leads.service';
import { CATALOGO_VACIO, filtrarMedicos, filtrarServicios, moduloDeServicio } from '../catalogo.util';
import { parsearMonto } from '../monto';
import { origenInequivoco } from '../origen-inequivoco';
import { CatalogoClinico, ComprobanteSubido, MetodoPagoVenta, Venta } from '../venta.model';
import { VentasService } from '../ventas.service';

/** Lo mínimo de una paciente para registrarle una venta. */
export type PacienteVenta = Pick<Cliente, 'id' | 'nombre' | 'telefono'> & { readonly pac?: string | null };

export const METODOS_PAGO: readonly { id: MetodoPagoVenta; label: string; icon: IconName }[] = [
  { id: 'QR', label: 'Pago QR', icon: 'dollar-sign' },
  { id: 'TRANSFERENCIA', label: 'Transferencia', icon: 'wallet' },
  { id: 'TARJETA', label: 'Tarjeta Déb./Créd.', icon: 'wallet' },
  { id: 'EFECTIVO', label: 'Efectivo en Caja', icon: 'dollar-sign' },
];

/**
 * El ÚNICO formulario para registrar una venta. Lo usan la página de Ventas y
 * el panel del chat.
 *
 * Eran dos copias y se habían separado justo en lo que importa: la del chat
 * —por donde se registra casi todo— nunca mandaba el lead de origen, así que
 * la atribución de CAMP-1 dio 0 de 18 ventas en producción; tampoco frenaba el
 * doble envío ni esperaba a que terminara de subir el comprobante. Además las
 * dos leían el monto con `Number()`: «4.500» se guardaba como Bs 4,50.
 *
 * El cajón (`<app-drawer>`) es parte del componente: quien lo monta solo lo
 * abre con `DialogService.abrirCajon()` y escucha `registrada` y `cerrar`.
 */
@Component({
  selector: 'app-formulario-venta',
  imports: [
    AvatarComponent,
    BadgeComponent,
    ButtonComponent,
    DatePipe,
    DrawerComponent,
    FilterChipComponent,
    IconComponent,
    InicialesClientePipe,
    InputComponent,
    NombreClientePipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './formulario-venta.component.html',
})
export class FormularioVentaComponent {
  private readonly ventas = inject(VentasService);
  private readonly clientes = inject(ClientesService);
  private readonly leads = inject(LeadsService);
  private readonly moneda = inject(MonedaService);

  /** Paciente con el que se abre (el chat, o la ficha desde donde se vino). */
  readonly paciente = input<PacienteVenta | null>(null);
  /** true en el chat: la venta es de esa paciente y no se cambia. */
  readonly pacienteFijo = input(false);
  /** Lead desde cuya ficha se vino: es el origen, sin preguntar. */
  readonly leadIdContexto = input<string | null>(null);

  readonly cerrar = output<void>();
  readonly registrada = output<Venta>();

  protected readonly metodosPago = METODOS_PAGO;
  protected readonly origenLabel = ORIGEN_LABEL;

  protected readonly elegido = signal<PacienteVenta | null>(null);
  protected readonly busqueda = signal('');
  protected readonly producto = signal('');
  protected readonly monto = signal('');
  protected readonly medico = signal('');
  protected readonly metodoPago = signal<MetodoPagoVenta>('QR');
  protected readonly comprobante = signal('');
  protected readonly notas = signal('');
  protected readonly comprobanteSubido = signal<ComprobanteSubido | null>(null);
  protected readonly subiendoComprobante = signal(false);
  protected readonly guardando = signal(false);
  protected readonly error = signal('');

  protected readonly leadId = signal<string | null>(null);
  /** Un chip pulsado o un lead de contexto es una decisión: la preselección no la pisa. */
  private readonly origenDecidido = signal(false);
  /** Una intención de registrar por cajón: el doble envío no cuenta dos ventas. */
  private readonly clave = crypto.randomUUID();

  protected readonly montoLeido = computed(() => parsearMonto(this.monto()));
  protected readonly montoLegible = computed(() => {
    const valor = this.montoLeido();
    return valor === null ? null : this.moneda.formatearBob(valor);
  });

  protected readonly catalogo = httpResource<CatalogoClinico>(() => this.ventas.catalogoRequest(), {
    defaultValue: CATALOGO_VACIO,
  });
  protected readonly servicios = computed(() => filtrarServicios(this.catalogo.value(), this.producto()).slice(0, 8));
  protected readonly medicos = computed(() => filtrarMedicos(this.catalogo.value(), this.medico()));
  protected readonly modulo = computed(() => moduloDeServicio(this.catalogo.value(), this.producto()));

  protected readonly resultados = httpResource<RespuestaPaginada<Cliente>>(
    () => {
      const termino = this.busqueda().trim();
      return termino.length >= 2 && !this.elegido() ? this.clientes.buscarRequest(termino) : undefined;
    },
    { defaultValue: paginaVacia<Cliente>() },
  );

  private readonly leadsDelPaciente = httpResource<RespuestaPaginada<Lead>>(
    () => {
      const paciente = this.elegido();
      return paciente ? this.leads.listarRequest({ clienteId: paciente.id, pagina: 1, limite: 10 }) : undefined;
    },
    { defaultValue: paginaVacia<Lead>() },
  );
  protected readonly leadsAbiertos = computed(() =>
    this.leadsDelPaciente.value().datos.filter(l => l.estado === 'NUEVO' || l.estado === 'CONTACTADO'),
  );

  constructor() {
    effect(() => {
      const paciente = this.paciente();
      const leadId = this.leadIdContexto();
      untracked(() => {
        if (paciente) this.elegir(paciente);
        if (leadId) {
          this.leadId.set(leadId);
          this.origenDecidido.set(true);
        }
      });
    });

    /* Con UN lead abierto, ese es el origen — ver `origenInequivoco`. */
    effect(() => {
      const propuesto = origenInequivoco(this.leadsAbiertos());
      if (untracked(() => this.origenDecidido() || this.leadId() !== null)) return;
      if (propuesto) this.leadId.set(propuesto);
    });
  }

  protected elegir(paciente: PacienteVenta): void {
    this.elegido.set(paciente);
    this.busqueda.set('');
    this.leadId.set(null);
    this.origenDecidido.set(false);
  }

  protected cambiarPaciente(): void {
    this.elegido.set(null);
    this.leadId.set(null);
    this.origenDecidido.set(false);
  }

  protected elegirOrigen(leadId: string | null): void {
    this.origenDecidido.set(true);
    this.leadId.set(leadId);
  }

  protected async adjuntar(event: Event): Promise<void> {
    const archivo = (event.target as HTMLInputElement).files?.[0];
    if (!archivo) return;
    this.subiendoComprobante.set(true);
    this.error.set('');
    try {
      this.comprobanteSubido.set(await this.ventas.subirComprobante(archivo));
    } catch (err) {
      this.error.set(mensajeDeError(err, 'No se pudo subir el comprobante.'));
      this.comprobanteSubido.set(null);
    } finally {
      this.subiendoComprobante.set(false);
    }
  }

  protected async guardar(event: Event): Promise<void> {
    event.preventDefault();
    if (this.guardando()) return;
    this.error.set('');

    const paciente = this.elegido();
    const monto = this.montoLeido();
    if (!paciente) return this.error.set('Busca y elige a la paciente.');
    if (!this.producto().trim()) return this.error.set('Indica el procedimiento o servicio vendido.');
    if (monto === null) return this.error.set('Ingresa un monto válido en Bs, por ejemplo 4.500 o 4500,50.');
    if (this.subiendoComprobante()) return this.error.set('Espera a que termine de subir el comprobante.');

    const adjunto = this.comprobanteSubido();
    this.guardando.set(true);
    try {
      const venta = await this.ventas.crear({
        clienteId: paciente.id,
        producto: this.producto().trim(),
        monto,
        metodoPago: this.metodoPago(),
        comprobante: this.comprobante().trim() || undefined,
        comprobanteKey: adjunto?.comprobanteKey,
        comprobanteMime: adjunto?.comprobanteMime,
        comprobanteNombre: adjunto?.comprobanteNombre,
        medico: this.medico().trim() || undefined,
        modulo: this.modulo() || undefined,
        notas: this.notas().trim() || undefined,
        leadId: this.leadId() ?? undefined,
        clientRequestId: this.clave,
      });
      this.registrada.emit(venta);
    } catch (err) {
      this.error.set(mensajeDeError(err, 'No se pudo registrar la venta. Intenta de nuevo.'));
    } finally {
      this.guardando.set(false);
    }
  }
}
