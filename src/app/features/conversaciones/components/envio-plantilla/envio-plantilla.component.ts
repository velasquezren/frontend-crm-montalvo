import { ChangeDetectionStrategy, Component, computed, input, model, output } from '@angular/core';

import { BadgeComponent } from '../../../../shared/components/badge/badge.component';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { IconComponent } from '../../../../shared/components/icon/icon.component';
import { InputComponent } from '../../../../shared/components/input/input.component';
import { LoadingSkeletonComponent } from '../../../../shared/components/loading-skeleton/loading-skeleton.component';
import { PlantillaResumen } from '../../conversacion.model';
import { etiquetaVariable, faltaParaEnviar, motivoNoDisponible } from '../../plantillas';
import { VistaPreviaPlantillaComponent } from '../vista-previa-plantilla/vista-previa-plantilla.component';

/**
 * Elegir una plantilla aprobada, completar sus datos y ver el mensaje tal como
 * le llegará al paciente.
 *
 * Lo usan el compositor (chat fuera de la ventana de 24 h) y «Nuevo chat». Es
 * presentacional: la lista, el estado de carga y el envío son de quien lo
 * monta, que sabe de qué línea son las plantillas y a quién van.
 */
@Component({
  selector: 'app-envio-plantilla',
  imports: [BadgeComponent, ButtonComponent, IconComponent, InputComponent, LoadingSkeletonComponent, VistaPreviaPlantillaComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './envio-plantilla.component.html',
  styleUrl: './envio-plantilla.component.css',
})
export class EnvioPlantillaComponent {
  readonly plantillas = input.required<readonly PlantillaResumen[]>();
  readonly cargando = input(false);
  readonly error = input(false);
  /** Nombre de la línea, para que quede claro desde qué número sale. */
  readonly linea = input<string | null>(null);
  /**
   * Si la paciente pidió no recibir promociones, desde cuándo. Apaga las de
   * Marketing con el motivo a la vista. «Nuevo chat» a un número nuevo no lo
   * sabe: ahí lo frena el backend.
   */
  readonly bajaPromocionesEn = input<string | null>(null);

  readonly seleccionada = model<PlantillaResumen | null>(null);
  readonly valores = model<readonly string[]>([]);

  readonly actualizar = output<void>();

  protected readonly etiqueta = etiquetaVariable;

  /** Por qué no se puede elegir cada una, en el orden de la lista (`null` = se puede). */
  protected readonly motivos = computed(() => {
    const baja = this.bajaPromocionesEn();
    return new Map(this.plantillas().map(p => [p, motivoNoDisponible(p, baja)]));
  });

  protected readonly falta = computed(() => {
    const p = this.seleccionada();
    return p ? faltaParaEnviar(p, this.valores()) : null;
  });

  protected elegir(p: PlantillaResumen): void {
    if (this.motivos().get(p) || this.seleccionada()?.nombre === p.nombre) return;
    this.seleccionada.set(p);
    this.valores.set(p.nombresVariables.map(() => ''));
  }

  protected cambiarValor(indice: number, valor: string): void {
    this.valores.update(actuales => actuales.map((v, i) => (i === indice ? valor : v)));
  }
}
