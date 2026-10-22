import { httpResource } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';

import { mensajeDeError } from '../../../core/api/http-error';
import { ToastService } from '../../../core/toast/toast.service';
import { BadgeComponent } from '../../../shared/components/badge/badge.component';
import { ButtonComponent } from '../../../shared/components/button/button.component';
import { ErrorCargaComponent } from '../../../shared/components/error-carga/error-carga.component';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { InputComponent } from '../../../shared/components/input/input.component';
import { LoadingSkeletonComponent } from '../../../shared/components/loading-skeleton/loading-skeleton.component';
import { AVISO_TELEFONO_INVALIDO, telefonoParaEscribir } from '../../../shared/models/telefono';
import { ReservasService } from '../reservas.service';
import { AvisosCaja, ESTADO_PLANTILLA_CAJA, NumeroCaja } from './avisos-caja.model';

/**
 * «Avisos a caja», en el cajón de Reservas: los WhatsApp que reciben «comprobante
 * nuevo, revíselo en FileMaker» y si hoy salen (la plantilla en Meta). Solo se
 * monta para administración; el backend lo vuelve a exigir.
 */
@Component({
  selector: 'app-avisos-caja',
  imports: [BadgeComponent, ButtonComponent, DatePipe, ErrorCargaComponent, IconComponent, InputComponent, LoadingSkeletonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './avisos-caja.component.html',
  /* Columna que encoge: sin esto su cuerpo `flex-1 overflow-y-auto` no desplaza y el cajón corta el final. */
  host: { class: 'flex-1 min-h-0 flex flex-col' },
})
export class AvisosCajaComponent {
  private readonly servicio = inject(ReservasService);
  private readonly toast = inject(ToastService);

  protected readonly estados = ESTADO_PLANTILLA_CAJA;

  /** Tras «Actualizar estado», el servidor le vuelve a preguntar a Meta en vez de usar lo recordado. */
  private readonly forzar = signal(false);
  protected readonly recurso = httpResource<AvisosCaja>(() => this.servicio.avisosCajaRequest(this.forzar()));
  /** Lo que respondió el servidor tras agregar o quitar; si no hay, lo leído. */
  private readonly tras = signal<AvisosCaja | null>(null);
  protected readonly datos = computed(() => this.tras() ?? (this.recurso.hasValue() ? this.recurso.value() : null));
  /** El mensaje con datos de ejemplo en vez de `{{1}}`…: así se lee como lo verá caja. */
  protected readonly vistaPrevia = computed(() => {
    const cuerpo = this.datos()?.plantilla.cuerpo ?? '';
    const ejemplo = ['Ana Pérez', '1234567', 'Juan Carlos Montalvo Doria Medina', 'lunes, 2 de noviembre, 15:00', 'Bs 400'];
    return cuerpo.replace(/\{\{(\d)\}\}/g, (_, n: string) => ejemplo[Number(n) - 1] ?? '…');
  });

  protected readonly nombre = signal('');
  protected readonly telefono = signal('');
  protected readonly ocupado = signal<'agregar' | string | null>(null);
  protected readonly confirmando = signal<string | null>(null);

  protected readonly normalizado = computed(() => telefonoParaEscribir(this.telefono()));
  protected readonly errorNumero = computed(() => (this.telefono().trim() && !this.normalizado() ? AVISO_TELEFONO_INVALIDO : ''));
  protected readonly lleno = computed(() => {
    const d = this.datos();
    return !!d && d.numeros.length >= d.maximo;
  });
  protected readonly puedeAgregar = computed(() => !!this.normalizado() && this.nombre().trim().length >= 2 && !this.lleno() && this.ocupado() === null);

  protected async agregar(): Promise<void> {
    const telefono = this.normalizado();
    if (!telefono || !this.puedeAgregar()) return;
    this.ocupado.set('agregar');
    try {
      this.tras.set(await this.servicio.agregarNumeroCaja(this.nombre().trim(), telefono));
      this.nombre.set('');
      this.telefono.set('');
      this.toast.success('Desde ahora ese número recibe los avisos de comprobantes nuevos.', 'Número agregado');
    } catch (err) {
      this.toast.error(mensajeDeError(err, 'No se pudo agregar el número.'), 'Error');
    } finally {
      this.ocupado.set(null);
    }
  }

  protected async quitar(n: NumeroCaja): Promise<void> {
    this.ocupado.set(n.id);
    try {
      this.tras.set(await this.servicio.quitarNumeroCaja(n.id));
      this.confirmando.set(null);
      this.toast.success(`${n.nombre} ya no recibe los avisos de caja.`, 'Número quitado');
    } catch (err) {
      this.toast.error(mensajeDeError(err, 'No se pudo quitar el número.'), 'Error');
    } finally {
      this.ocupado.set(null);
    }
  }

  protected refrescar(): void {
    this.tras.set(null);
    if (this.forzar()) this.recurso.reload();
    else this.forzar.set(true);
  }
}
