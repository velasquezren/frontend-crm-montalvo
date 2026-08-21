import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';

import { MonedaService } from '../../../core/moneda/moneda.service';

export interface ChartItem {
  readonly label: string;
  readonly value: number;
  readonly secondaryValue?: number;
  readonly color?: string;
  readonly sublabel?: string;
  /** Clave estable para navegación al hacer clic — si falta, se usa `label`. */
  readonly id?: string;
}

/**
 * Organismo de Gráfico de Barras y Columnas SVG/CSS Reutilizable.
 * Cumple 100% con los tokens del sistema de diseño (styles.css).
 * Soporta barras horizontales ('BAR') y columnas verticales ('COLUMN').
 */
@Component({
  selector: 'app-bar-chart',
  imports: [],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="chart-container">
      @if (title()) {
        <div class="flex items-center justify-between mb-4">
          <div>
            <h3 class="text-sm font-bold text-text-dark tracking-tight">{{ title() }}</h3>
            @if (subtitle()) {
              <p class="text-xs text-text-muted mt-0.5">{{ subtitle() }}</p>
            }
          </div>
          @if (totalSum() > 0) {
            <span class="text-xs font-bold text-primary bg-bg-light px-2.5 py-1 rounded-full border border-border">
              Total: {{ format(totalSum()) }}
            </span>
          }
        </div>
      }

      @if (items().length === 0) {
        <div class="flex flex-col items-center justify-center py-10 text-text-muted">
          <p class="text-xs font-medium">Sin datos disponibles para mostrar</p>
        </div>
      } @else if (mode() === 'BAR') {
        <!-- Modo Barras Horizontales -->
        <div class="flex flex-col gap-3">
          @for (item of processedItems(); track item.label) {
            <div
              class="group relative"
              (mouseenter)="hoveredLabel.set(item.label)"
              (mouseleave)="hoveredLabel.set(null)"
              (click)="segmentClick.emit(item.id ?? item.label)">
              <div class="flex items-center justify-between text-xs mb-1">
                <span class="font-medium text-text-dark truncate max-w-[65%] group-hover:text-primary transition-colors">
                  {{ item.label }}
                  @if (item.sublabel) {
                    <span class="text-text-muted font-normal text-[11px]">({{ item.sublabel }})</span>
                  }
                </span>
                <span class="font-bold text-text-dark whitespace-nowrap">
                  {{ format(item.value) }}
                  @if (item.pct > 0) {
                    <span class="text-[10px] text-text-muted font-normal ml-1">({{ item.pct }}%)</span>
                  }
                </span>
              </div>
              <div class="h-3 w-full bg-bg-light rounded-full overflow-hidden p-0.5 border border-border/50">
                <div
                  class="h-full rounded-full transition-all duration-500 ease-out"
                  [style.width.%]="item.barWidth"
                  [style.background-color]="item.color || 'var(--color-primary)'"></div>
              </div>
            </div>
          }
        </div>
      } @else {
        <!-- Modo Columnas Verticales -->
        <div class="grafico-columnas" [style.height]="height()">
          @for (item of processedItems(); track item.label) {
            <div
              class="columna"
              (mouseenter)="hoveredLabel.set(item.label)"
              (mouseleave)="hoveredLabel.set(null)"
              (click)="segmentClick.emit(item.id ?? item.label)">

              @if (hoveredLabel() === item.label) {
                <div class="columna-tooltip">
                  {{ item.label }} · {{ format(item.value) }}
                  @if (item.sublabel) { <span class="opacity-70">({{ item.sublabel }})</span> }
                </div>
              }

              <span class="columna-valor">{{ formatCompact(item.value) }}</span>

              <!-- La pista ocupa el alto restante: es contra ella que se
                   resuelve el alto porcentual de la barra. Sin esto, todas
                   las columnas se veían del mismo tamaño. -->
              <div class="columna-pista">
                <div
                  class="columna-barra"
                  [style.height.%]="item.barWidth"
                  [style.background-color]="item.color || 'var(--color-primary)'"></div>
              </div>

              <span class="columna-etiqueta">{{ item.label }}</span>
            </div>
          }
        </div>
      }
    </div>
  `,
  styles: `
    .chart-container {
      width: 100%;
    }

    /* ── Columnas verticales ──────────────────────────────────────── */
    .grafico-columnas {
      display: flex;
      align-items: stretch;
      gap: 6px;
      padding: 26px 4px 0;
      border-bottom: 1px solid var(--color-border);
    }

    .columna {
      position: relative;
      flex: 1 1 0;
      min-width: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      cursor: pointer;
    }

    .columna-valor {
      font-size: 10px;
      font-weight: 700;
      line-height: 1;
      margin-bottom: 5px;
      color: var(--color-text-muted);
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
      transition: color 0.15s;
    }

    .columna:hover .columna-valor {
      color: var(--color-primary);
    }

    /* Ocupa todo el alto sobrante — imprescindible para que la barra escale. */
    .columna-pista {
      flex: 1 1 auto;
      min-height: 0;
      width: 100%;
      max-width: 46px;
      display: flex;
      align-items: flex-end;
      justify-content: center;
    }

    .columna-barra {
      width: 100%;
      border-radius: 6px 6px 0 0;
      transition: height 0.45s cubic-bezier(0.4, 0, 0.2, 1), filter 0.15s;
      min-height: 3px;
    }

    .columna:hover .columna-barra {
      filter: brightness(1.08);
    }

    .columna-etiqueta {
      font-size: 11px;
      font-weight: 600;
      line-height: 1;
      margin-top: 8px;
      color: var(--color-text-muted);
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
      transition: color 0.15s;
    }

    .columna:hover .columna-etiqueta {
      color: var(--color-text-dark);
    }

    .columna-tooltip {
      position: absolute;
      top: -6px;
      left: 50%;
      transform: translate(-50%, -100%);
      z-index: 20;
      padding: 5px 10px;
      font-size: 11px;
      font-weight: 600;
      color: white;
      background: var(--color-text-dark);
      border-radius: 8px;
      box-shadow: var(--shadow-lifted);
      white-space: nowrap;
      pointer-events: none;
    }

    /* Con muchos días el valor sobre cada barra se amontona: se oculta y
       queda disponible en el tooltip. */
    @container (max-width: 560px) {
      .columna-valor { display: none; }
    }
  `,
})
export class BarChartComponent {
  readonly items = input<readonly ChartItem[]>([]);
  readonly mode = input<'BAR' | 'COLUMN'>('COLUMN');
  readonly title = input<string>('');
  readonly subtitle = input<string>('');
  readonly height = input<string>('240px');
  private readonly moneda = inject(MonedaService);

  readonly formatType = input<'currency' | 'number' | 'percent'>('currency');
  /**
   * En qué moneda vienen los valores de la serie.
   *
   * Por defecto BOB, que es lo que hacía este componente cuando formateaba con
   * `formatearBs`. Se declara porque no siempre es cierto: las gráficas de
   * Reportes se alimentan de la analítica de comisiones, que viene en DÓLARES, y
   * las estaban imprimiendo con la etiqueta "Bs" sin convertir — la misma cifra
   * que la tabla de al lado mostraba multiplicada por el tipo de cambio.
   */
  readonly origenMoneda = input<'USD' | 'BOB'>('BOB');

  /** Clic en una barra/columna — emite `item.id` (o `label` si no hay id). Mismo contrato que `<app-donut-chart>`. */
  readonly segmentClick = output<string>();

  protected readonly hoveredLabel = signal<string | null>(null);

  protected readonly maxValue = computed(() => {
    const list = this.items();
    if (!list.length) return 1;
    return Math.max(...list.map(i => i.value), 1);
  });

  protected readonly totalSum = computed(() => {
    return this.items().reduce((acc, curr) => acc + curr.value, 0);
  });

  protected readonly processedItems = computed(() => {
    const max = this.maxValue();
    const sum = this.totalSum();
    return this.items().map(item => {
      const pct = sum > 0 ? Math.round((item.value / sum) * 100) : 0;
      const barWidth = max > 0 ? Math.max((item.value / max) * 100, 4) : 0;
      return {
        ...item,
        pct,
        barWidth,
      };
    });
  });

  protected format(val: number): string {
    const type = this.formatType();
    if (type === 'currency') return this.moneda.formatear(val, this.origenMoneda());
    if (type === 'percent') return `${val.toFixed(1)}%`;
    return val.toLocaleString('es-BO');
  }

  protected formatCompact(val: number): string {
    const type = this.formatType();
    if (type === 'currency') {
      if (val >= 1000000) return `${(val / 1000000).toFixed(1)}M`;
      if (val >= 1000) return `${(val / 1000).toFixed(1)}k`;
      return String(Math.round(val));
    }
    if (type === 'percent') return `${Math.round(val)}%`;
    if (val >= 1000) return `${(val / 1000).toFixed(1)}k`;
    return String(val);
  }
}
