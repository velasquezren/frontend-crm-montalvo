import { ChangeDetectionStrategy, Component, computed, input, model } from '@angular/core';
import { FilterChipComponent } from '../../shared/components/filter-chip/filter-chip.component';
import { SwitchComponent } from '../../shared/components/switch/switch.component';
import { LineaWhatsapp } from './linea-whatsapp.model';

/**
 * Qué líneas ve una cuenta y cuáles de ellas le suenan.
 *
 * Son dos decisiones y no una: una agente de ventas que también cubre
 * Recepción necesita VER esos chats, pero que le suene cada mensaje del pool
 * es cómo acaba desactivando las notificaciones del teléfono entero —y
 * entonces tampoco le suenan sus pacientes—. Por eso el interruptor está por
 * línea asignada y no es un «sin notificaciones» general.
 */
@Component({
  selector: 'app-selector-lineas',
  imports: [FilterChipComponent, SwitchComponent],
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
  </fieldset>
  @if (asignadas().length) {
    <fieldset class="space-y-2 pt-2">
      <legend class="text-sm font-medium text-text-dark">Avisos de mensajes nuevos</legend>
      <p class="text-xs text-text-muted">
        Apagado, sigue viendo esos chats pero no le suenan en el teléfono ni en la
        pestaña. Los chats que tenga asignados le avisan igual.
      </p>
      <ul class="rounded-xl border border-border divide-y divide-border">
        @for (linea of asignadas(); track linea.id) {
          <li class="flex items-center justify-between gap-3 px-3 py-2.5">
            <span class="text-sm text-text-dark">{{ linea.nombre }}</span>
            <app-switch
              [value]="!silenciadas().includes(linea.id)"
              (valueChange)="alternarAviso(linea.id, $event)"
              [ariaLabel]="'Avisos de ' + linea.nombre" />
          </li>
        }
      </ul>
    </fieldset>
  }`,
})
export class SelectorLineasComponent {
  readonly lineas = input.required<readonly LineaWhatsapp[]>();
  readonly ids = model<string[]>([]);
  /** Líneas asignadas cuyos mensajes no le suenan. */
  readonly silenciadas = model<string[]>([]);

  protected readonly asignadas = computed(() => this.lineas().filter(l => this.ids().includes(l.id)));

  alternar(id: string): void {
    const quitada = this.ids().includes(id);
    this.ids.update((ids) => (quitada ? ids.filter((v) => v !== id) : [...ids, id]));
    /* Quitarle la línea se lleva su silencio, igual que en el backend: si se
       la vuelven a dar, vuelve sonando, como una línea nueva. */
    if (quitada) this.silenciadas.update((s) => s.filter((v) => v !== id));
  }

  protected alternarAviso(id: string, suena: boolean): void {
    this.silenciadas.update((s) => {
      const sin = s.filter((v) => v !== id);
      return suena ? sin : [...sin, id];
    });
  }
}
