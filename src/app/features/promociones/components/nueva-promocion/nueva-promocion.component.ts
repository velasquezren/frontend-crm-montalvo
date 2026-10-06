import { ChangeDetectionStrategy, Component, computed, inject, output, signal } from '@angular/core';

import { mensajeDeError } from '../../../../core/api/http-error';
import { ToastService } from '../../../../core/toast/toast.service';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { DrawerComponent } from '../../../../shared/components/drawer/drawer.component';
import { IconComponent } from '../../../../shared/components/icon/icon.component';
import { InputComponent } from '../../../../shared/components/input/input.component';
import { fechaCivilClinica } from '../../../actividades/zona-clinica';
import { PromocionDetalle } from '../../promocion.model';
import { PromocionesService } from '../../promociones.service';

/**
 * «Nueva promoción»: lo mínimo para que exista como borrador. Lo demás
 * —banners, precios, condiciones— se completa en su ficha, que se abre al crearla.
 */
@Component({
  selector: 'app-nueva-promocion',
  imports: [ButtonComponent, DrawerComponent, IconComponent, InputComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './nueva-promocion.component.html',
})
export class NuevaPromocionComponent {
  private readonly servicio = inject(PromocionesService);
  private readonly toast = inject(ToastService);

  readonly creada = output<PromocionDetalle>();
  readonly cerrar = output<void>();

  protected readonly titulo = signal('');
  protected readonly resumen = signal('');
  protected readonly vigenteDesde = signal(fechaCivilClinica(new Date()));
  protected readonly vigenteHasta = signal('');
  protected readonly creando = signal(false);

  /** Lo que falta, dicho en una línea junto al botón; `null` = se puede crear. */
  protected readonly falta = computed(() => {
    if (this.titulo().trim().length < 3) return 'Escribe un título.';
    if (this.resumen().trim().length < 3) return 'Escribe un resumen de una línea.';
    if (!this.vigenteDesde()) return 'Elige desde cuándo vale.';
    if (this.vigenteHasta() && this.vigenteHasta() < this.vigenteDesde()) return 'La vigencia termina antes de empezar.';
    return null;
  });

  protected async crear(): Promise<void> {
    if (this.falta() || this.creando()) return;
    this.creando.set(true);
    try {
      const creada = await this.servicio.crear({
        titulo: this.titulo().trim(),
        resumen: this.resumen().trim(),
        vigenteDesde: this.vigenteDesde(),
        vigenteHasta: this.vigenteHasta() || null,
      });
      this.toast.success('Borrador creado: súbele el banner y complétala.');
      this.creada.emit(creada);
    } catch (error) {
      this.toast.error(mensajeDeError(error, 'No se pudo crear la promoción.'));
    } finally {
      this.creando.set(false);
    }
  }
}
