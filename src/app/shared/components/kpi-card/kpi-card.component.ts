import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { IconComponent, IconName } from '../icon/icon.component';

/**
 * Tono de un indicador. Los cuatro salen de la paleta cerrada; no hay más.
 * `critical` es **negro**, no rojo — ver los estados semánticos del skill
 * `crm-design-system`.
 */
export type KpiTono = 'primary' | 'secondary' | 'neutral' | 'critical';

/**
 * Tarjeta de indicador: etiqueta, valor grande, ícono y pie.
 *
 * Existe porque `.kpi-card` estaba **definida a mano en cuatro CSS distintos**
 * (`servicios.page`, `servicios-kpis`, el cajón del historial y `analitica.page`).
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
    <div
      class="kpi-card"
      [class.kpi-card-destacado]="destacado()"
      [class.kpi-card-compacto]="compacto()">
      <div class="kpi-cabecera">
        <span class="kpi-label">{{ label() }}</span>
        <div [class]="'kpi-icono kpi-icono-' + tono()">
          <app-icon [name]="icon()" [size]="compacto() ? 14 : 18" />
        </div>
      </div>
      <span [class]="tonoValor() ? 'kpi-valor kpi-valor-' + tonoValor() : 'kpi-valor'">
        {{ valorFormateado() }}
      </span>
      @if (pie()) {
        <span class="kpi-pie">
          @if (pieIcono(); as ico) {
            <app-icon [name]="ico" [size]="12" class="kpi-pie-icono" />
          }
          {{ pie() }}
        </span>
      }
      <ng-content />
    </div>
  `,
  styleUrl: './kpi-card.component.css',
})
export class KpiCardComponent {
  readonly label = input.required<string>();

  /**
   * Acepta número o texto ya formateado (`formatearBs(…)`, un porcentaje…).
   *
   * Si llega un número lo formatea el propio átomo, y esa es la gracia: los
   * conteos se ven igual en todas las vistas sin que cada plantilla se acuerde
   * de poner `| number`. Antes unas lo hacían y otras no, y "1234 pacientes"
   * convivía con "1.234 pacientes" en pantallas contiguas.
   */
  readonly valor = input.required<string | number>();
  readonly icon = input.required<IconName>();
  /** Tono del ícono de la cabecera. */
  readonly tono = input<KpiTono>('neutral');
  /** Resalta la tarjeta principal del grupo con el degradado de marca. */
  readonly destacado = input(false);
  readonly pie = input('');

  /**
   * Tiñe el número. Se usa cuando el propio valor comunica algo —comisión en
   * `secondary`, filas excluidas en `critical`— y no solo el ícono. Sin valor,
   * el número va en el color de texto normal.
   */
  readonly tonoValor = input<KpiTono | ''>('');

  /** Ícono pequeño delante del pie, para reforzar lo que dice esa línea. */
  readonly pieIcono = input<IconName | undefined>(undefined);

  /**
   * Versión reducida: la mitad de aire, número más chico y sin el realce al
   * pasar por encima.
   *
   * En un dashboard el KPI **es** el contenido y merece su tamaño. Dentro de un
   * cajón es solo el encabezado de otra cosa —el historial del paciente, el
   * perfil del médico—, y tres tarjetas grandes se comían la columna antes de
   * llegar a lo que se venía a ver.
   *
   * Es un `input()` del átomo y no una copia con "casi lo mismo": duplicar la
   * tarjeta es exactamente cómo `.kpi-card` acabó definida a mano en cuatro CSS
   * distintos, que es el problema que este componente vino a resolver.
   */
  readonly compacto = input(false);

  /** Mismo locale que el resto del CRM (`es-BO`): separador de miles con punto. */
  protected readonly valorFormateado = computed(() => {
    const v = this.valor();
    return typeof v === 'number' ? v.toLocaleString('es-BO') : v;
  });
}
