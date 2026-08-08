import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import { ButtonComponent } from '../button/button.component';
import { EmptyStateComponent } from '../empty-state/empty-state.component';

/**
 * Estado de error de una vista con datos remotos.
 *
 * Existe porque faltaba en seis vistas, y su ausencia no se veía como un hueco
 * sino como una **mentira**: sin él, un backend caído cae en el estado vacío y
 * la pantalla afirma "no hay clientes" o "no hay comisiones". El agente lo lee
 * como un dato —"hoy no hay nada"— y cierra, cuando lo que pasa es que el
 * servidor no contesta.
 *
 * Se apoya en `<app-empty-state>` en vez de maquetar otro bloque: un error de
 * carga y un listado vacío ocupan el mismo sitio y deben pesar lo mismo en la
 * página; lo único que cambia es el mensaje y que aquí hay algo que hacer.
 *
 *     @if (errorCarga()) {
 *       <app-error-carga que="los clientes" (reintentar)="clientes.reload()" />
 *     }
 */
@Component({
  selector: 'app-error-carga',
  imports: [EmptyStateComponent, ButtonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-empty-state
      icon="alert-circle"
      [title]="titulo() || 'No se pudieron cargar ' + que()"
      [description]="
        descripcion() ||
        'No hay respuesta del servidor. Revisa tu conexión e inténtalo de nuevo.'
      ">
      <app-button icon="loader" (clicked)="reintentar.emit()">Reintentar</app-button>
    </app-empty-state>
  `,
})
export class ErrorCargaComponent {
  /**
   * Qué no se pudo traer, en minúscula y plural: "los clientes", "las ventas".
   * Se compone en una frase, así que no lleva mayúscula inicial ni punto.
   */
  readonly que = input<string>('los datos');
  /** Título completo, si el compuesto no encaja. */
  readonly titulo = input<string>('');
  readonly descripcion = input<string>('');

  readonly reintentar = output<void>();
}
