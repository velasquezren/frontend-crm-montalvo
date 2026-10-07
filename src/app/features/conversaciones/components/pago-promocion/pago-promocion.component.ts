import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal, signal } from '@angular/core';

import { BadgeComponent } from '../../../../shared/components/badge/badge.component';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { IconComponent } from '../../../../shared/components/icon/icon.component';
import { InputComponent } from '../../../../shared/components/input/input.component';
import { MonedaPipe } from '../../../../shared/pipes/moneda.pipe';
import { primerNombre } from '../../atencion-humana';
import { ESTADO_PAGO, PagoDelChat, PromocionDelChat, VARIANTE_PAGO } from '../../pago-promocion';
import { ConversacionesStateService } from '../../services/conversaciones-state.service';

/**
 * El pago de una promoción en el chat: cuánto, de qué promoción y en qué está. Con
 * un comprobante por verificar, la persona lo abre, y lo confirma (nace la venta)
 * o pide otro con un motivo que le llega a la paciente. Sin pago, si llegó por el
 * código de una promoción, una línea lo dice.
 *
 * No decide nada: el estado viene del servidor y cada acción la valida él.
 */
@Component({
  selector: 'app-pago-promocion',
  imports: [BadgeComponent, ButtonComponent, IconComponent, InputComponent, MonedaPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './pago-promocion.component.html',
  styleUrl: './pago-promocion.component.css',
})
export class PagoPromocionComponent {
  protected readonly state = inject(ConversacionesStateService);

  readonly conversacionId = input<string | null>(null);
  readonly pago = input<PagoDelChat | null>(null);
  readonly promocion = input<PromocionDelChat | null>(null);

  /* Al cambiar de chat, el formulario de «pedir otro» vuelve a empezar cerrado y vacío. */
  protected readonly pidiendoOtro = linkedSignal({ source: this.conversacionId, computation: () => false });
  protected readonly motivo = linkedSignal({ source: this.conversacionId, computation: () => '' });
  protected readonly errorMotivo = signal<string | undefined>(undefined);

  protected readonly estados = ESTADO_PAGO;
  protected readonly variantes = VARIANTE_PAGO;
  protected readonly primerNombre = primerNombre;

  /** Confirmar registra una venta: la agente o un admin (el servidor lo vuelve a exigir). */
  protected readonly puedeConfirmar = this.state.puedeGestionComercial;
  protected readonly puedeCompletar = computed(() => this.puedeConfirmar()
    && !!this.pago()?.registroPendiente
    && this.pago()?.cerradoPor?.id === this.state.currentUserId());

  /** El mensaje del comprobante, del hilo cargado: su enlace firmado y si es una imagen. */
  protected readonly comprobante = computed(() => {
    const id = this.pago()?.comprobanteMensajeId;
    if (!id) return null;
    const m = this.state.detalleActual()?.mensajes.find(x => x.id === id);
    return m ? { url: m.mediaUrl ?? null, imagen: m.tipo === 'IMAGEN', nombre: m.mediaNombre ?? 'Comprobante' } : null;
  });

  protected confirmar(): void {
    if (!this.puedeConfirmar()) return;
    const p = this.pago();
    if (p) void this.state.accionPago(p.id, 'confirmar');
  }

  protected async enviarPedido(event: Event): Promise<void> {
    event.preventDefault();
    if (!this.puedeConfirmar()) return;
    const p = this.pago();
    const motivo = this.motivo().trim();
    if (!p) return;
    if (motivo.length < 3) {
      this.errorMotivo.set('Escribe el motivo: es lo que leerá la paciente.');
      return;
    }
    this.errorMotivo.set(undefined);
    if (await this.state.accionPago(p.id, 'pedir-otro', motivo)) {
      this.pidiendoOtro.set(false);
      this.motivo.set('');
    }
  }

  /** Anular cierra sin venta y no se deshace: se pregunta antes. */
  protected anular(): void {
    if (!this.puedeConfirmar()) return;
    const p = this.pago();
    if (p && window.confirm(`¿Anular el pago de «${p.promocion.titulo}»? No registra venta y no se le avisa a la paciente.`)) {
      void this.state.accionPago(p.id, 'anular');
    }
  }
}
