import { ChangeDetectionStrategy, Component, computed, input, model } from '@angular/core';
import { FilterChipComponent } from '../../shared/components/filter-chip/filter-chip.component';
import { AvisoLinea, LineaWhatsapp } from './linea-whatsapp.model';
import { ListaAvisosLineasComponent } from './lista-avisos-lineas.component';

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
  imports: [FilterChipComponent, ListaAvisosLineasComponent],
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
  @if (avisosAsignadas().length) {
    <fieldset class="space-y-2 pt-2">
      <legend class="text-sm font-medium text-text-dark">Avisos de mensajes nuevos</legend>
      <p class="text-xs text-text-muted">
        Apagado, sigue viendo esos chats pero no le suenan en el teléfono ni en la
        pestaña. Los chats que tenga asignados le avisan igual.
      </p>
      <app-lista-avisos-lineas [avisos]="avisosAsignadas()" (cambio)="alternarAviso($event.lineaId, $event.suena)" />
    </fieldset>
  }`,
})
export class SelectorLineasComponent {
  readonly lineas = input.required<readonly LineaWhatsapp[]>();
  readonly ids = model<string[]>([]);
  /** Líneas asignadas cuyos mensajes no le suenan. */
  readonly silenciadas = model<string[]>([]);

  /** Las líneas asignadas, en la forma del renglón compartido. */
  protected readonly avisosAsignadas = computed<AvisoLinea[]>(() =>
    this.lineas()
      .filter(l => this.ids().includes(l.id))
      .map(l => ({ lineaId: l.id, nombre: l.nombre, telefono: l.telefono, suena: !this.silenciadas().includes(l.id) })),
  );

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
