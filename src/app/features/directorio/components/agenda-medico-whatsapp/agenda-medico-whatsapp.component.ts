import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { DatePipe } from '@angular/common';

import { mensajeDeError } from '../../../../core/api/http-error';
import { ToastService } from '../../../../core/toast/toast.service';
import { AVISO_TELEFONO_INVALIDO, telefonoParaEscribir } from '../../../../shared/models/telefono';
import { BadgeComponent } from '../../../../shared/components/badge/badge.component';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { ErrorCargaComponent } from '../../../../shared/components/error-carga/error-carga.component';
import { IconComponent } from '../../../../shared/components/icon/icon.component';
import { InputComponent } from '../../../../shared/components/input/input.component';
import { LoadingSkeletonComponent } from '../../../../shared/components/loading-skeleton/loading-skeleton.component';
import { AccesoWhatsappMedico, RespuestaAccesoWhatsapp } from '../../agenda-medicos.model';
import { AgendaMedicosService } from '../../agenda-medicos.service';

/**
 * El número de WhatsApp del médico, para que el asistente le conteste SU agenda
 * (docs/asistente-ia.md, «Agenda del médico»). Solo se monta para administración:
 * el teléfono es un dato privado y quien lo autoriza responde de a quién le abre
 * los pacientes del día. El backend vuelve a exigirlo; esto solo decide qué se pinta.
 *
 * No lleva «versión» ni borrador: es una sola cosa (un número) que se autoriza o se
 * quita, y cada gesto queda en la bitácora del servidor.
 */
@Component({
  selector: 'app-agenda-medico-whatsapp',
  imports: [BadgeComponent, ButtonComponent, DatePipe, ErrorCargaComponent, IconComponent, InputComponent, LoadingSkeletonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './agenda-medico-whatsapp.component.html',
})
export class AgendaMedicoWhatsappComponent {
  private readonly servicio = inject(AgendaMedicosService);
  private readonly toast = inject(ToastService);

  readonly id = input.required<number>();
  readonly nombre = input.required<string>();
  /** Un médico inactivo no puede recibir acceso nuevo (el backend lo rechaza igual). */
  readonly activo = input(true);

  protected readonly recurso = httpResource<RespuestaAccesoWhatsapp>(() => this.servicio.accesoWhatsappRequest(this.id()));
  /** Lo último que dijo el servidor tras guardar o quitar; si no hay, lo leído. */
  private readonly tras = signal<{ acceso: AccesoWhatsappMedico | null } | null>(null);
  protected readonly acceso = computed(() => {
    /* Ojo: `null` es una respuesta (acabo de quitarlo), no «sin dato»: `??` volvería a mostrar el número leído antes. */
    const despues = this.tras();
    if (despues) return despues.acceso;
    return this.recurso.hasValue() ? this.recurso.value().acceso : null;
  });
  protected readonly cargado = computed(() => this.tras() !== null || this.recurso.hasValue());

  protected readonly escrito = signal('');
  protected readonly ocupado = signal<'autorizar' | 'quitar' | null>(null);
  protected readonly confirmando = signal(false);
  /** El E.164 que se mandaría, o null si lo escrito no parece un teléfono (no se muestra error con el campo vacío). */
  protected readonly normalizado = computed(() => telefonoParaEscribir(this.escrito()));
  protected readonly errorNumero = computed(() => (this.escrito().trim() && !this.normalizado() ? AVISO_TELEFONO_INVALIDO : ''));
  protected readonly esElMismo = computed(() => !!this.normalizado() && this.normalizado() === this.acceso()?.telefono);

  protected async autorizar(): Promise<void> {
    const telefono = this.normalizado();
    if (!telefono || this.esElMismo()) return;
    this.ocupado.set('autorizar');
    try {
      this.tras.set({ acceso: await this.servicio.autorizarWhatsapp(this.id(), telefono) });
      this.escrito.set('');
      this.toast.success(`Ahora ${this.nombre()} puede consultar su agenda desde ese número.`, 'Número autorizado');
    } catch (err) {
      this.toast.error(mensajeDeError(err, 'No se pudo autorizar el número.'), 'Error');
    } finally {
      this.ocupado.set(null);
    }
  }

  protected async quitar(): Promise<void> {
    this.ocupado.set('quitar');
    try {
      await this.servicio.quitarWhatsapp(this.id());
      this.tras.set({ acceso: null });
      this.confirmando.set(false);
      this.toast.success('Ese número ya no consulta la agenda: se atiende como el de cualquier paciente.', 'Acceso quitado');
    } catch (err) {
      this.toast.error(mensajeDeError(err, 'No se pudo quitar el acceso.'), 'Error');
    } finally {
      this.ocupado.set(null);
    }
  }

  protected recargar(): void {
    this.tras.set(null);
    this.recurso.reload();
  }
}
