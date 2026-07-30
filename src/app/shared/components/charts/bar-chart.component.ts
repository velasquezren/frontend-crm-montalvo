import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';

import { formatearBs } from '../../pipes/moneda.pipe';

export interface ChartItem {
  readonly label: string;
  readonly value: number;
  readonly secondaryValue?: number;
  readonly color?: string;
  readonly sublabel?: string;
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
              (mouseleave)="hoveredLabel.set(null)">
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
        <div class="pt-6 pb-2" [style.height]="height()">
          <div class="h-full flex items-end justify-between gap-2 border-b border-border pb-2 px-1">
            @for (item of processedItems(); track item.label) {
              <div
                class="flex-1 flex flex-col items-center h-full justify-end group relative cursor-pointer"
                (mouseenter)="hoveredLabel.set(item.label)"
                (mouseleave)="hoveredLabel.set(null)">

                <!-- Tooltip al pasar el cursor -->
                @if (hoveredLabel() === item.label) {
                  <div class="absolute -top-10 z-20 bg-text-dark text-white text-[11px] font-semibold py-1 px-2.5 rounded-lg shadow-lifted whitespace-nowrap animate-fade-in pointer-events-none">
                    {{ item.label }}: {{ format(item.value) }}
                  </div>
                }

                <!-- Valor superior si cabe -->
                <span class="text-[10px] font-bold text-text-muted mb-1 opacity-80 group-hover:opacity-100 group-hover:text-primary transition-all">
                  {{ formatCompact(item.value) }}
                </span>

                <!-- Columna vertical con animación -->
                <div class="w-full max-w-[42px] bg-bg-light rounded-t-lg overflow-hidden flex items-end p-0.5 border border-border/50 transition-all group-hover:border-primary/50">
                  <div
                    class="w-full rounded-t-md transition-all duration-500 ease-out"
                    [style.height.%]="item.barWidth"
                    [style.background-color]="item.color || 'var(--color-primary)'"></div>
                </div>

                <!-- Etiqueta eje X -->
                <span class="text-[11px] font-semibold text-text-muted mt-2 truncate w-full text-center group-hover:text-text-dark transition-colors">
                  {{ item.label }}
                </span>
              </div>
            }
          </div>
        </div>
      }
    </div>
  `,
  styles: `
    .chart-container {
      width: 100%;
    }
  `,
})
export class BarChartComponent {
  readonly items = input<readonly ChartItem[]>([]);
  readonly mode = input<'BAR' | 'COLUMN'>('COLUMN');
  readonly title = input<string>('');
  readonly subtitle = input<string>('');
  readonly height = input<string>('240px');
  readonly formatType = input<'currency' | 'number' | 'percent'>('currency');

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
    if (type === 'currency') return formatearBs(val);
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
