import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';

import { formatearBs } from '../../pipes/moneda.pipe';
import { ChartItem } from './bar-chart.component';

/**
 * Gráfico de dona en SVG puro — para repartos donde importa la proporción
 * (categorías de servicio, canal de venta) más que comparar magnitudes.
 *
 * SVG y no canvas: escala nítido en cualquier pantalla, se imprime bien y cada
 * porción es un elemento del DOM, así que puede recibir foco y describirse a un
 * lector. Sin librerías: son dos círculos y `stroke-dasharray`.
 *
 * Reutiliza `ChartItem` del gráfico de barras para que una misma serie sirva
 * para los dos sin transformarla.
 */
@Component({
  selector: 'app-donut-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="donut-contenedor">
      @if (title()) {
        <div class="donut-cabecera">
          <h3 class="donut-titulo">{{ title() }}</h3>
          @if (subtitle()) {
            <p class="donut-subtitulo">{{ subtitle() }}</p>
          }
        </div>
      }

      @if (porciones().length === 0) {
        <p class="donut-vacio">Sin datos para este periodo</p>
      } @else {
        <div class="donut-cuerpo">
          <div class="donut-grafico">
            <svg viewBox="0 0 42 42" role="img" [attr.aria-label]="descripcion()">
              <!-- Aro de fondo: da continuidad cuando una porción es diminuta. -->
              <circle class="donut-pista" cx="21" cy="21" r="15.915" />

              @for (p of porciones(); track p.clave) {
                <circle
                  class="donut-porcion"
                  [class.donut-porcion-atenuada]="resaltada() !== null && resaltada() !== p.clave"
                  cx="21" cy="21" r="15.915"
                  [attr.stroke]="p.color"
                  [attr.stroke-dasharray]="p.arco + ' ' + (100 - p.arco)"
                  [attr.stroke-dashoffset]="p.offset"
                  [style.--retraso]="p.indice * 90 + 'ms'"
                  (mouseenter)="resaltada.set(p.clave)"
                  (mouseleave)="resaltada.set(null)" />
              }
            </svg>

            <!-- Centro: el total, o la porción sobre la que está el cursor. -->
            <div class="donut-centro">
              @if (detalleCentro(); as d) {
                <span class="donut-centro-valor">{{ d.valor }}</span>
                <span class="donut-centro-etiqueta">{{ d.etiqueta }}</span>
              }
            </div>
          </div>

          <ul class="donut-leyenda">
            @for (p of porciones(); track p.clave) {
              <li
                class="donut-leyenda-item"
                [class.donut-leyenda-activa]="resaltada() === p.clave"
                [class.donut-leyenda-atenuada]="resaltada() !== null && resaltada() !== p.clave"
                (mouseenter)="resaltada.set(p.clave)"
                (mouseleave)="resaltada.set(null)">
                <span class="donut-punto" [style.background-color]="p.color"></span>
                <span class="donut-leyenda-texto" [title]="p.label">{{ p.label }}</span>
                <span class="donut-leyenda-pct">{{ p.pct }}%</span>
              </li>
            }
          </ul>
        </div>
      }
    </div>
  `,
  styles: `
    :host { display: block; width: 100%; }

    .donut-cabecera { margin-bottom: 14px; }

    .donut-titulo {
      font-size: 14px;
      font-weight: 700;
      color: var(--color-text-dark);
      letter-spacing: -0.01em;
    }

    .donut-subtitulo {
      font-size: 12px;
      color: var(--color-text-muted);
      margin-top: 2px;
    }

    .donut-vacio {
      padding: 32px 0;
      text-align: center;
      font-size: 12px;
      color: var(--color-text-muted);
    }

    .donut-cuerpo {
      display: flex;
      align-items: center;
      gap: 20px;
      flex-wrap: wrap;
    }

    .donut-grafico {
      position: relative;
      width: 170px;
      height: 170px;
      flex-shrink: 0;
      margin: 0 auto;
    }

    .donut-grafico svg {
      width: 100%;
      height: 100%;
      transform: rotate(-90deg); /* empieza arriba, como se espera de una dona */
    }

    .donut-pista {
      fill: none;
      stroke: var(--color-bg-light);
      stroke-width: 5;
    }

    .donut-porcion {
      fill: none;
      stroke-width: 5;
      stroke-linecap: butt;
      cursor: pointer;
      transition: stroke-width 0.22s var(--ease-spring-smooth, cubic-bezier(0.16, 1, 0.3, 1)), opacity 0.2s ease;
      /* Se dibuja desde cero al aparecer, escalonando cada porción. */
      animation: donut-entrada 0.7s cubic-bezier(0.32, 0.72, 0, 1) backwards;
      animation-delay: var(--retraso, 0ms);
    }

    .donut-porcion:hover {
      stroke-width: 7;
    }

    .donut-porcion-atenuada,
    .donut-leyenda-atenuada {
      opacity: 0.35;
    }

    @keyframes donut-entrada {
      from { stroke-dasharray: 0 100; }
    }

    .donut-centro {
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      pointer-events: none;
      text-align: center;
      padding: 0 20px;
    }

    .donut-centro-valor {
      font-size: 16px;
      font-weight: 800;
      line-height: 1.1;
      color: var(--color-text-dark);
      font-variant-numeric: tabular-nums;
      letter-spacing: -0.02em;
    }

    .donut-centro-etiqueta {
      font-size: 10px;
      font-weight: 600;
      line-height: 1.25;
      color: var(--color-text-muted);
      margin-top: 3px;
      text-transform: uppercase;
      letter-spacing: 0.03em;
    }

    .donut-leyenda {
      flex: 1 1 180px;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 6px;
      padding: 0;
      margin: 0;
      list-style: none;
    }

    .donut-leyenda-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 5px 8px;
      border-radius: 8px;
      font-size: 12px;
      cursor: pointer;
      transition: background-color 0.15s ease, opacity 0.15s ease;
    }

    .donut-leyenda-item:hover,
    .donut-leyenda-activa {
      background-color: var(--color-bg-light);
    }

    .donut-punto {
      width: 9px;
      height: 9px;
      border-radius: 3px;
      flex-shrink: 0;
    }

    .donut-leyenda-texto {
      flex: 1;
      min-width: 0;
      font-weight: 500;
      color: var(--color-text-dark);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .donut-leyenda-pct {
      font-weight: 700;
      font-size: 11px;
      color: var(--color-primary);
      background: color-mix(in srgb, var(--color-primary) 10%, white);
      padding: 1px 6px;
      border-radius: 6px;
      font-variant-numeric: tabular-nums;
      flex-shrink: 0;
    }

    /* Quien pidió menos movimiento en su sistema no ve la animación. */
    @media (prefers-reduced-motion: reduce) {
      .donut-porcion {
        animation: none;
      }
    }
  `,
})
export class DonutChartComponent {
  readonly items = input<readonly ChartItem[]>([]);
  readonly title = input<string>('');
  readonly subtitle = input<string>('');
  /** Qué se lee en el centro cuando no hay nada resaltado. */
  readonly etiquetaTotal = input<string>('Total');

  protected readonly resaltada = signal<string | null>(null);

  private readonly total = computed(() =>
    this.items().reduce((suma, item) => suma + item.value, 0),
  );

  /**
   * Convierte la serie en arcos. `stroke-dasharray` trabaja sobre una
   * circunferencia de 100 unidades (r = 15.915), así que el arco es
   * directamente el porcentaje y el offset, lo acumulado hasta esa porción.
   */
  protected readonly porciones = computed(() => {
    const total = this.total();
    if (total <= 0) return [];

    let acumulado = 0;
    return this.items().map((item, indice) => {
      const arco = (item.value / total) * 100;
      const porcion = {
        clave: item.label,
        label: item.label,
        color: item.color ?? 'var(--color-primary)',
        valor: item.value,
        pct: Math.round(arco * 10) / 10,
        arco,
        // El desfase va en negativo porque el trazo avanza en sentido horario.
        offset: -acumulado,
        indice,
      };
      acumulado += arco;
      return porcion;
    });
  });

  protected readonly detalleCentro = computed(() => {
    const resaltada = this.resaltada();
    if (resaltada === null) {
      return { valor: formatearBs(this.total()), etiqueta: this.etiquetaTotal() };
    }
    const porcion = this.porciones().find(p => p.clave === resaltada);
    if (!porcion) return null;
    return { valor: `${porcion.pct}%`, etiqueta: porcion.label };
  });

  /** Descripción para lectores de pantalla: el gráfico no se puede "ver". */
  protected readonly descripcion = computed(() => {
    const partes = this.porciones().map(p => `${p.label}: ${p.pct}%`);
    return `${this.title() || 'Reparto'}. ${partes.join('. ')}`;
  });
}
