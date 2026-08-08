import {
  ChangeDetectionStrategy,
  Component,
  ViewEncapsulation,
  computed,
  input,
  output,
} from '@angular/core';

import { IconComponent } from '../icon/icon.component';

export type DireccionOrden = 'asc' | 'desc';

/**
 * Cabecera de tabla ordenable.
 *
 * Es un **selector de atributo sobre `th`** y no un `<app-…>`: una tabla solo
 * admite `th` como hijo de `tr`, y meter un componente en medio rompe el
 * marcado (y con él el `colspan`, el sticky y la alineación heredada que ya
 * resuelve `<app-table>`).
 *
 *     <th appOrdenable="nombre" [orden]="orden()" [direccion]="direccion()"
 *         (ordenar)="ordenarPor($event)">Paciente</th>
 *
 * La flecha se ve siempre, apagada, para que se note que la columna se puede
 * ordenar antes de tocarla; al activarse se enciende y gira.
 *
 * Ordena el SERVIDOR, no esta cabecera: solo emite qué columna se pidió. Con
 * 15.000+ fichas paginadas de 25 en 25, ordenar en el cliente ordenaría la
 * página visible y mentiría sobre el resto.
 */
@Component({
  selector: 'th[appOrdenable]',
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: {
    class: 'crm-th-orden',
    '[class.crm-th-orden-activa]': 'activa()',
    role: 'button',
    tabindex: '0',
    '[attr.aria-sort]': 'ariaSort()',
    '(click)': 'alternar()',
    '(keydown.enter)': 'alternar()',
    '(keydown.space)': 'alternar()',
  },
  template: `
    <span class="crm-th-orden-caja">
      <ng-content />
      <app-icon
        name="chevron-down"
        [size]="12"
        class="crm-th-orden-flecha"
        [class.crm-th-orden-flecha-asc]="activa() && direccion() === 'asc'" />
    </span>
  `,
  styles: `
    .crm-th-orden {
      cursor: pointer;
      user-select: none;
      transition: color 0.15s;
    }

    .crm-th-orden:hover,
    .crm-th-orden:focus-visible {
      color: var(--color-primary);
      outline: none;
    }

    .crm-th-orden-activa {
      color: var(--color-primary);
    }

    .crm-th-orden-caja {
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }

    /* Apagada mientras la columna no ordena: insinúa que se puede pulsar sin
       competir con la que sí está activa. */
    .crm-th-orden-flecha {
      opacity: 0.35;
      transition: transform 0.2s, opacity 0.15s;
    }

    .crm-th-orden:hover .crm-th-orden-flecha {
      opacity: 0.7;
    }

    .crm-th-orden-activa .crm-th-orden-flecha {
      opacity: 1;
    }

    /* Ascendente = flecha hacia arriba. Se gira la de abajo en vez de añadir un
       ícono nuevo: el catálogo es cerrado. */
    .crm-th-orden-flecha-asc {
      transform: rotate(180deg);
    }
  `,
})
export class ThOrdenableComponent {
  /** Clave de la columna, tal como la espera el backend. */
  readonly appOrdenable = input.required<string>();
  /** Columna por la que se está ordenando ahora, si es alguna. */
  readonly orden = input<string | undefined>(undefined);
  readonly direccion = input<DireccionOrden>('asc');
  /** Con qué dirección arranca al activarla: los importes suelen querer `desc`. */
  readonly direccionInicial = input<DireccionOrden>('asc');

  readonly ordenar = output<{ orden: string; direccion: DireccionOrden }>();

  protected readonly activa = computed(() => this.orden() === this.appOrdenable());

  protected readonly ariaSort = computed(() =>
    this.activa() ? (this.direccion() === 'asc' ? 'ascending' : 'descending') : 'none',
  );

  protected alternar(): void {
    this.ordenar.emit({
      orden: this.appOrdenable(),
      /* Sobre la columna activa se invierte; sobre una nueva se empieza por su
         dirección natural. */
      direccion: this.activa()
        ? this.direccion() === 'asc'
          ? 'desc'
          : 'asc'
        : this.direccionInicial(),
    });
  }
}
