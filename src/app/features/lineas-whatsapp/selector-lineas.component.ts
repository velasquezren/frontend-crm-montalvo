import { ChangeDetectionStrategy, Component, input, model } from '@angular/core';
import { FilterChipComponent } from '../../shared/components/filter-chip/filter-chip.component';
import { LineaWhatsapp } from './linea-whatsapp.model';
@Component({
  selector: 'app-selector-lineas',
  imports: [FilterChipComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: ` <fieldset class="space-y-2">
    <legend class="text-sm font-medium text-text-dark">Líneas autorizadas</legend>
    <div role="group" aria-label="Líneas autorizadas" class="flex flex-wrap gap-2">
      @for (linea of lineas(); track linea.id) {
        <app-filter-chip [active]="ids().includes(linea.id)" (clicked)="alternar(linea.id)">
          {{ linea.nombre }} · {{ linea.telefono || 'Línea comercial actual' }}
        </app-filter-chip>
      } @empty {
        <p class="text-sm text-text-muted">No hay líneas disponibles.</p>
      }
    </div>
    @if (!ids().length) {
      <p class="text-xs text-text-muted">
        Sin líneas asignadas, esta cuenta no verá ni responderá chats.
      </p>
    }
  </fieldset>`,
})
export class SelectorLineasComponent {
  readonly lineas = input.required<readonly LineaWhatsapp[]>();
  readonly ids = model<string[]>([]);
  alternar(id: string): void {
    this.ids.update((ids) => (ids.includes(id) ? ids.filter((v) => v !== id) : [...ids, id]));
  }
}
