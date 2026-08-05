import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { IconComponent, IconName } from '../icon/icon.component';

/** Tono del ícono. Los tres salen de la paleta cerrada; no hay más. */
export type KpiTono = 'primary' | 'secondary' | 'neutral';

/**
 * Tarjeta de indicador: etiqueta, valor grande, ícono y pie.
 *
 * Existe porque `.kpi-card` estaba **definida a mano en cuatro CSS distintos**
 * (`servicios.page`, `servicios-kpis`, el cajón del historial y `reportes.page`).
 * Con encapsulación `Emulated` cada plantilla necesita su copia, así que cada
 * arreglo había que hacerlo cuatro veces — y en la práctica se hacía en una.
 * Este es el caso que el skill `crm-design-system` describe como señal de que un
 * bloque ya no pertenece a una vista sino al sistema.
 *
 * Sin `@if` sobre el contenido proyectado: el pie y la barra se omiten solos si
 * no se pasan.
 */
@Component({
  selector: 'app-kpi-card',
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="kpi-card" [class.kpi-card-destacado]="destacado()">
      <div class="kpi-cabecera">
        <span class="kpi-label">{{ label() }}</span>
        <div [class]="'kpi-icono kpi-icono-' + tono()">
          <app-icon [name]="icon()" [size]="18" />
        </div>
      </div>
      <span class="kpi-valor">{{ valor() }}</span>
      @if (pie()) {
        <span class="kpi-pie">{{ pie() }}</span>
      }
      <ng-content />
    </div>
  `,
  styleUrl: './kpi-card.component.css',
})
export class KpiCardComponent {
  readonly label = input.required<string>();
  readonly valor = input.required<string>();
  readonly icon = input.required<IconName>();
  readonly tono = input<KpiTono>('neutral');
  /** Resalta la tarjeta principal del grupo con el degradado de marca. */
  readonly destacado = input(false);
  readonly pie = input('');
}
