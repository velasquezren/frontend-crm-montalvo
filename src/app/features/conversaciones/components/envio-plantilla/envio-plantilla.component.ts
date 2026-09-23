import { ChangeDetectionStrategy, Component, computed, input, model, output } from '@angular/core';

import { BadgeComponent } from '../../../../shared/components/badge/badge.component';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { InputComponent } from '../../../../shared/components/input/input.component';
import { PlantillaResumen } from '../../conversacion.model';
import { etiquetaVariable, faltaParaEnviar, renderizarPlantilla } from '../../plantillas';

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
  imports: [BadgeComponent, ButtonComponent, InputComponent],
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

  readonly seleccionada = model<PlantillaResumen | null>(null);
  readonly valores = model<readonly string[]>([]);

  readonly actualizar = output<void>();

  protected readonly etiqueta = etiquetaVariable;

  protected readonly vistaPrevia = computed(() => {
    const p = this.seleccionada();
    return p ? renderizarPlantilla(p, this.valores()) : '';
  });

  protected readonly falta = computed(() => {
    const p = this.seleccionada();
    return p ? faltaParaEnviar(p, this.valores()) : null;
  });

  protected elegir(p: PlantillaResumen): void {
    if (!p.enviable || this.seleccionada()?.nombre === p.nombre) return;
    this.seleccionada.set(p);
    this.valores.set(p.nombresVariables.map(() => ''));
  }

  protected cambiarValor(indice: number, valor: string): void {
    this.valores.update(actuales => actuales.map((v, i) => (i === indice ? valor : v)));
  }
}
