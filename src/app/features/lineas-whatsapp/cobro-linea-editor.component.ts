import { ChangeDetectionStrategy, Component, computed, effect, inject, input, linkedSignal, output, signal } from '@angular/core';
import { httpResource } from '@angular/common/http';

import { mensajeDeError } from '../../core/api/http-error';
import { ToastService } from '../../core/toast/toast.service';
import { problemaDeImagen, TIPOS_IMAGEN_PUBLICA } from '../../shared/models/catalogo';
import { BadgeComponent } from '../../shared/components/badge/badge.component';
import { ButtonComponent } from '../../shared/components/button/button.component';
import { DrawerComponent } from '../../shared/components/drawer/drawer.component';
import { ErrorCargaComponent } from '../../shared/components/error-carga/error-carga.component';
import { IconComponent } from '../../shared/components/icon/icon.component';
import { InputComponent } from '../../shared/components/input/input.component';
import { LoadingSkeletonComponent } from '../../shared/components/loading-skeleton/loading-skeleton.component';
import { SwitchComponent } from '../../shared/components/switch/switch.component';
import { CobroEditable, ESTADO_COBRO, GuardarCobro } from './cobro-linea.model';
import { LineasWhatsappService } from './lineas-whatsapp.service';

function formulario(c: CobroEditable | undefined): GuardarCobro {
  const cobro = c?.cobro;
  return {
    activo: cobro?.activo ?? false,
    banco: cobro?.banco ?? '',
    titular: cobro?.titular ?? '',
    instrucciones: cobro?.instrucciones ?? '',
    venceEl: cobro?.venceEl ?? '',
  };
}

/**
 * El QR con que esta línea cobra una promoción por WhatsApp. Cuando está activo y
 * vigente, la tarjeta de cada promoción ofrece «Pagar ahora» y el CRM le manda este
 * QR con el monto; el comprobante lo verifica una persona en el chat.
 */
@Component({
  selector: 'app-cobro-linea-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BadgeComponent, ButtonComponent, DrawerComponent, ErrorCargaComponent, IconComponent, InputComponent, LoadingSkeletonComponent, SwitchComponent],
  templateUrl: './cobro-linea-editor.component.html',
})
export class CobroLineaEditorComponent {
  private readonly service = inject(LineasWhatsappService);
  private readonly toast = inject(ToastService);

  readonly lineaId = input.required<string>();
  readonly nombre = input('');
  readonly cerrar = output<void>();
  readonly cambiosSinGuardar = output<boolean>();

  protected readonly datos = httpResource<CobroEditable>(() => this.service.cobroRequest(this.lineaId()));
  protected readonly borrador = linkedSignal<GuardarCobro>(() => formulario(this.datos.value()));
  protected readonly guardando = signal(false);
  protected readonly subiendo = signal(false);
  protected readonly error = signal('');
  protected readonly tiposImagen = TIPOS_IMAGEN_PUBLICA;
  protected readonly estados = ESTADO_COBRO;

  readonly sinGuardar = computed(() => this.datos.hasValue() && JSON.stringify(this.borrador()) !== JSON.stringify(formulario(this.datos.value())));

  constructor() {
    effect(() => this.cambiosSinGuardar.emit(this.sinGuardar()));
  }

  protected cambiar(cambios: Partial<GuardarCobro>): void {
    this.borrador.update(b => ({ ...b, ...cambios }));
  }

  protected async guardar(): Promise<void> {
    if (this.guardando()) return;
    const b = this.borrador();
    this.guardando.set(true);
    this.error.set('');
    try {
      this.datos.set(await this.service.guardarCobro(this.lineaId(), {
        activo: b.activo,
        banco: b.banco.trim(),
        titular: b.titular.trim(),
        instrucciones: b.instrucciones?.trim() || null,
        venceEl: b.venceEl || null,
      }));
      this.toast.success(b.activo ? 'Cobro guardado y activo.' : 'Cobro guardado. Está apagado.');
    } catch (err) {
      this.error.set(mensajeDeError(err, 'No se pudo guardar el cobro.'));
    } finally {
      this.guardando.set(false);
    }
  }

  protected async elegirQr(evento: Event): Promise<void> {
    const entrada = evento.target as HTMLInputElement;
    const archivo = entrada.files?.[0];
    entrada.value = '';
    if (!archivo || this.subiendo()) return;
    const problema = problemaDeImagen(archivo);
    if (problema) {
      this.error.set(problema);
      return;
    }
    this.subiendo.set(true);
    this.error.set('');
    try {
      const nuevo = await this.service.subirQr(this.lineaId(), archivo);
      /* Lo escrito en el formulario no se pierde al subir la imagen. */
      const escrito = this.borrador();
      this.datos.set(nuevo);
      this.borrador.set(escrito);
      this.toast.success('QR actualizado.');
    } catch (err) {
      this.error.set(mensajeDeError(err, 'No se pudo subir el QR.'));
    } finally {
      this.subiendo.set(false);
    }
  }
}
