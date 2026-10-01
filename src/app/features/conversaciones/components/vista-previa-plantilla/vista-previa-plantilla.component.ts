import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { PlantillaResumen } from '../../conversacion.model';
import { renderizarPlantilla } from '../../plantillas';

/**
 * La plantilla tal como la leerá la paciente: imagen de cabecera, burbuja y
 * botones, con las variables ya sustituidas.
 *
 * La comparten el selector del chat y el formulario de campañas. Vivía dentro
 * del selector, con su CSS encapsulado: para usarla en otra vista había que
 * copiar la burbuja, y la copia deja de parecerse al mensaje al primer ajuste.
 */
@Component({
  selector: 'app-vista-previa-plantilla',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './vista-previa-plantilla.component.css',
  template: `
    <div class="vista-previa">
      @if (plantilla().imagenCabecera; as imagen) {
        <!-- La misma imagen que recibirá: el CRM la adjunta sola al enviar. -->
        <img class="vista-previa__imagen" [src]="imagen" alt="Imagen de cabecera de la plantilla" loading="lazy" />
      }
      <p class="vista-previa__burbuja">{{ texto() }}</p>
      @for (boton of plantilla().botones; track boton) {
        <span class="vista-previa__boton">{{ boton }}</span>
      }
    </div>
  `,
})
export class VistaPreviaPlantillaComponent {
  readonly plantilla = input.required<PlantillaResumen>();
  /** Lo que va en cada variable, en el orden de la plantilla. */
  readonly valores = input<readonly string[]>([]);

  protected readonly texto = computed(() => renderizarPlantilla(this.plantilla(), this.valores()));
}
