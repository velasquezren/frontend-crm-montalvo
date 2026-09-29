import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import { SwitchComponent } from '../../shared/components/switch/switch.component';
import { AvisoLinea } from './linea-whatsapp.model';

/**
 * Las líneas con su interruptor de aviso: el renglón, nada más.
 *
 * Presentacional a propósito —no guarda nada ni sabe de quién son los avisos—
 * porque lo usan dos contenedores con reglas distintas: el Perfil guarda cada
 * toque al instante; la ficha de Agentes lo acumula hasta «Guardar cambios».
 * Estaban maquetados dos veces y ya habían divergido: uno mostraba el
 * teléfono de la línea y el otro no.
 */
@Component({
  selector: 'app-lista-avisos-lineas',
  imports: [SwitchComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ul class="rounded-xl border border-border divide-y divide-border">
      @for (aviso of avisos(); track aviso.lineaId) {
        <li class="flex items-center justify-between gap-3 px-3 py-2.5">
          <div class="min-w-0">
            <p class="text-sm font-medium text-text-dark truncate">{{ aviso.nombre }}</p>
            @if (aviso.telefono) { <p class="text-xs text-text-muted tabular-nums">{{ aviso.telefono }}</p> }
          </div>
          <app-switch
            [value]="aviso.suena"
            [disabled]="enEspera().includes(aviso.lineaId)"
            (valueChange)="cambio.emit({ lineaId: aviso.lineaId, suena: $event })"
            [ariaLabel]="'Avisos de ' + aviso.nombre" />
        </li>
      }
    </ul>
  `,
})
export class ListaAvisosLineasComponent {
  readonly avisos = input.required<readonly AvisoLinea[]>();
  /** Líneas con un cambio sin confirmar: su interruptor espera. */
  readonly enEspera = input<readonly string[]>([]);
  readonly cambio = output<{ lineaId: string; suena: boolean }>();
}
