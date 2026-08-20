import { ChangeDetectionStrategy, Component, ViewEncapsulation, input } from '@angular/core';

/**
 * Átomo Timeline — línea de tiempo vertical con el eje a la izquierda.
 *
 * Existía porque `.linea-tiempo` y `.evento` estaban copiados idénticos en los
 * CSS de los dos cajones de Servicios (historial del paciente y perfil del
 * médico). Con encapsulación `Emulated` el CSS de uno no llega al otro, así que
 * cualquier retoque había que hacerlo dos veces — y en la práctica se hacía en
 * una. Es el caso que `crm-design-system` describe como umbral para extraer un
 * átomo: dos plantillas que necesitan el mismo bloque.
 *
 * Igual que `<app-table>`: encapsulación `None`, CSS inline con `styles:` y
 * prefijo `.crm-timeline` para poder estilar el contenido proyectado (cada
 * `<article class="crm-timeline-evento">`) sin duplicar CSS en cada consumidor.
 *
 * Uso:
 *   <app-timeline>
 *     <article class="crm-timeline-evento">
 *       <span class="crm-timeline-fecha">14 ene</span>
 *       <div class="flex-1 min-w-0">…contenido…</div>
 *       <span class="crm-timeline-valor">Bs 120</span>
 *     </article>
 *   </app-timeline>
 *
 * El `<article>` se proyecta intacto: el átomo solo aporta el eje, el punto y
 * el espaciado. Así el contenido de cada evento sigue siendo de quien lo usa.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-timeline',
  encapsulation: ViewEncapsulation.None,
  template: `
    <div class="crm-timeline" [style.--crm-timeline-gap.px]="gap()">
      <ng-content />
    </div>
  `,
  styles: `
    /* Sin esto el host es inline y un margen vertical no le aplica: el consumidor
       acaba poniendo un \`style="margin-bottom"\` a mano en vez de usar la
       utilidad de siempre. Todos los átomos del sistema lo llevan. */
    app-timeline {
      display: block;
    }

    /* El contenedor porta el eje (::before) y espacia los eventos. */
    .crm-timeline {
      position: relative;
      display: flex;
      flex-direction: column;
      gap: var(--crm-timeline-gap, 10px);
      padding: 8px 4px 6px 26px;
    }

    /* Eje vertical con degradado turquesa → claro. */
    .crm-timeline::before {
      content: '';
      position: absolute;
      top: 8px;
      bottom: 8px;
      left: 7px;
      width: 2px;
      background: linear-gradient(
        to bottom,
        var(--color-secondary),
        color-mix(in srgb, var(--color-secondary) 25%, var(--color-background))
      );
      border-radius: 9999px;
    }

    /* Cada evento es una tarjeta a la derecha del eje, con su punto anclado a él. */
    .crm-timeline-evento {
      position: relative;
      display: flex;
      gap: 12px;
      padding: 12px 14px;
      background: var(--color-background);
      border: 1px solid var(--color-border);
      border-radius: 12px;
      transition:
        border-color 0.2s var(--ease-spring-smooth),
        box-shadow 0.2s var(--ease-spring-smooth);
    }

    .crm-timeline-evento:hover {
      border-color: var(--color-secondary);
      box-shadow: var(--shadow-subtle);
    }

    /* Punto anclado al eje: círculo blanco con borde turquesa. */
    .crm-timeline-evento::before {
      content: '';
      position: absolute;
      top: 18px;
      left: -23px;
      width: 9px;
      height: 9px;
      border-radius: 9999px;
      background: var(--color-background);
      border: 2px solid var(--color-secondary);
    }

    /* Etiqueta de fecha o conteo a la izquierda del evento. */
    .crm-timeline-fecha {
      min-width: 56px;
      font-size: 11px;
      font-weight: 700;
      color: var(--color-primary);
      font-variant-numeric: tabular-nums;
      padding-top: 2px;
    }

    /* Variante clicable: el evento entero es un botón que abre otra vista. */
    .crm-timeline-evento--clicable {
      cursor: pointer;
      transition: border-color 0.2s, transform 0.2s;
    }

    .crm-timeline-evento--clicable:hover:not(:disabled) {
      border-color: color-mix(in srgb, var(--color-primary) 40%, transparent);
      transform: translateX(2px);
    }

    .crm-timeline-evento--clicable:disabled {
      cursor: default;
    }

    @media (prefers-reduced-motion: reduce) {
      .crm-timeline-evento,
      .crm-timeline-evento--clicable {
        transition: none;
      }

      .crm-timeline-evento--clicable:hover:not(:disabled) {
        transform: none;
      }
    }
  `,
})
export class TimelineComponent {
  /** Gap entre eventos. Por defecto 10px; el cajón del médico usa 12px. */
  readonly gap = input<number | undefined>(undefined);
}
