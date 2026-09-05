import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';

import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { FilterChipComponent } from '../../../shared/components/filter-chip/filter-chip.component';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { InfoHintComponent } from '../../../shared/components/info-hint/info-hint.component';
import { SelectComponent } from '../../../shared/components/select/select.component';
import { TableComponent } from '../../../shared/components/table/table.component';
import { formatearUsd, MonedaPipe } from '../../../shared/pipes/moneda.pipe';
import { CANAL_LABEL, CLASIF_LABEL, LineaDesgloseVendedora, SUBTIPO_LABEL, UNIDAD_LABEL } from '../planilla.model';

type Subtipo = LineaDesgloseVendedora['subtipo'];
type CampoOrden = 'vendedoraNombre' | 'cantidad' | 'montoVendido' | 'baseCalculo' | 'porcentaje' | 'comisionUsd';
type DireccionOrden = 'asc' | 'desc';

/**
 * "¿Cuánto cobramos de Tipo B este mes?" — la pregunta que la tabla resumida
 * de `tabla-liquidacion.component.ts` no puede responder sin sumar a mano:
 * ahí Tipo B es UNA columna por vendedora, no una lista que se pueda filtrar
 * y sumar por categoría, canal o unidad de negocio.
 *
 * Es la misma fuente que la hoja "Desglose por tipo y sección" del Excel
 * (`ExportacionComisionesService`, backend) — el mismo `LineaDesglose`
 * persistido con lo que de verdad se pagó, no un recálculo aparte que podría
 * divergir.
 *
 * A propósito **no** muestra objetivo ni meta: esta vista responde "cuánto y
 * por qué", no "cuánto falta" — eso ya vive en "Planilla por Persona" y en
 * la pestaña Planes. Mezclarlos fue justo la queja que la motivó: filtrar
 * por Tipo B y encontrarse columnas de objetivo que no aplican a cirugías.
 *
 * Presentacional y en memoria, mismo criterio que `TablaLiquidacionComponent`:
 * el desglose de un periodo son decenas de filas, no miles — filtrar y
 * ordenar en el cliente no oculta nada que no esté también fuera de pantalla.
 */
@Component({
  selector: 'app-desglose-comisiones',
  imports: [MonedaPipe, TableComponent, FilterChipComponent, InfoHintComponent, IconComponent, EmptyStateComponent, SelectComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="desglose-filtros">
      <div role="group" aria-label="Tipo de comisión" class="grupo-chips">
        <app-filter-chip size="sm" [active]="filtroSubtipo() === null" (clicked)="filtroSubtipo.set(null)">
          Todos
        </app-filter-chip>
        @for (s of subtipos; track s) {
          <app-filter-chip
            size="sm"
            [active]="filtroSubtipo() === s"
            [count]="conteoPorSubtipo().get(s) ?? 0"
            (clicked)="alternarSubtipo(s)">
            {{ subtipoLabel[s] }}
          </app-filter-chip>
        }
        <app-info-hint titulo="Por qué separado de Planilla por Persona">
          <p>
            Ahí cada vendedora es una fila y cada tipo una columna — para ver el
            total de una persona. Acá cada línea es un grupo (categoría, canal,
            unidad de negocio) — para ver de dónde sale un cubo entero, sumando
            todas las vendedoras a la vez.
          </p>
          <p>
            <strong>Tipo A (RA)</strong> no es lo mismo que <strong>Tipo A ·
            Planes</strong>, aunque el Excel de administración marque las dos con
            la misma letra: una paga por plan elegido, la otra por nivel sobre el
            excedente mensual combinado.
          </p>
        </app-info-hint>
      </div>

      @if (vendedoras().length > 1) {
        <div class="min-w-[200px]">
          <app-select
            size="sm"
            [activo]="filtroVendedora() !== null"
            [value]="filtroVendedora() ?? ''"
            (valueChange)="onCambiarVendedora($event)"
            ariaLabel="Filtrar por vendedora">
            <option value="">Todas las vendedoras</option>
            @for (v of vendedoras(); track v.id) {
              <option [value]="v.id">{{ v.nombre }}</option>
            }
          </app-select>
        </div>
      }
    </div>

    @if (filasVisibles().length === 0) {
      <div class="py-4">
        <app-empty-state
          icon="file-text"
          title="Sin líneas para este filtro"
          description="Prueba cambiando de subtipo o seleccionando otra vendedora." />
      </div>
    } @else {
      <app-table [dense]="true">
        <thead>
          <tr>
            <th class="text-left cursor-pointer select-none hover:text-primary transition-colors" (click)="ordenarPor('vendedoraNombre')">
              Vendedora
              @if (ordenCampo() === 'vendedoraNombre') {
                <app-icon name="chevron-down" [size]="13" class="inline ml-0.5 text-primary transition-transform duration-200" [class.rotate-180]="ordenDireccion() === 'asc'" />
              }
            </th>
            <th class="text-left">Categoría</th>
            <th class="text-left">Canal</th>
            <th class="text-left">Unidad de negocio</th>
            <th class="text-right cursor-pointer select-none hover:text-primary transition-colors" (click)="ordenarPor('cantidad')">
              Cant.
              @if (ordenCampo() === 'cantidad') {
                <app-icon name="chevron-down" [size]="13" class="inline ml-0.5 text-primary transition-transform duration-200" [class.rotate-180]="ordenDireccion() === 'asc'" />
              }
            </th>
            <th class="text-right cursor-pointer select-none hover:text-primary transition-colors" (click)="ordenarPor('montoVendido')">
              Facturado
              @if (ordenCampo() === 'montoVendido') {
                <app-icon name="chevron-down" [size]="13" class="inline ml-0.5 text-primary transition-transform duration-200" [class.rotate-180]="ordenDireccion() === 'asc'" />
              }
            </th>
            <th class="text-right cursor-pointer select-none hover:text-primary transition-colors" (click)="ordenarPor('baseCalculo')">
              Base
              @if (ordenCampo() === 'baseCalculo') {
                <app-icon name="chevron-down" [size]="13" class="inline ml-0.5 text-primary transition-transform duration-200" [class.rotate-180]="ordenDireccion() === 'asc'" />
              }
            </th>
            <th class="text-right cursor-pointer select-none hover:text-primary transition-colors" (click)="ordenarPor('porcentaje')">
              %
              @if (ordenCampo() === 'porcentaje') {
                <app-icon name="chevron-down" [size]="13" class="inline ml-0.5 text-primary transition-transform duration-200" [class.rotate-180]="ordenDireccion() === 'asc'" />
              }
            </th>
            <th class="text-right cursor-pointer select-none hover:text-primary transition-colors" (click)="ordenarPor('comisionUsd')">
              Comisión
              @if (ordenCampo() === 'comisionUsd') {
                <app-icon name="chevron-down" [size]="13" class="inline ml-0.5 text-primary transition-transform duration-200" [class.rotate-180]="ordenDireccion() === 'asc'" />
              }
            </th>
          </tr>
        </thead>
        <tbody>
          @for (f of filasVisibles(); track f.vendedoraId + f.clasif + f.canal + f.unidadNegocio) {
            <tr>
              <td class="text-left font-medium text-text-dark whitespace-nowrap">{{ f.vendedoraNombre }}</td>
              <td class="text-left whitespace-nowrap">{{ clasifLabel[f.clasif] }}</td>
              <td class="text-left whitespace-nowrap text-text-muted">{{ canalLabel[f.canal] }}</td>
              <td class="text-left whitespace-nowrap text-text-muted">{{ unidadLabel[f.unidadNegocio] }}</td>
              <td class="text-right tabular-nums">{{ f.cantidad }}</td>
              <td class="text-right whitespace-nowrap">{{ f.montoVendido | moneda: 'USD' : tipoCambio() }}</td>
              <td class="text-right whitespace-nowrap text-text-muted">{{ f.baseCalculo | moneda: 'USD' : tipoCambio() }}</td>
              <td class="text-right tabular-nums">{{ f.porcentaje }}%</td>
              <td class="text-right font-semibold text-primary whitespace-nowrap">{{ f.comisionUsd | moneda: 'USD' : tipoCambio() }}</td>
            </tr>
          }
        </tbody>
        <tfoot>
          <tr class="fila-totales">
            <td class="text-left font-bold" colspan="4">
              SUMATORIA
              <span class="font-normal text-text-muted">
                ({{ filasVisibles().length }} línea{{ filasVisibles().length === 1 ? '' : 's' }})
              </span>
            </td>
            <td class="text-right font-bold tabular-nums">{{ totalesFiltro().cantidad }}</td>
            <td class="text-right font-bold whitespace-nowrap">{{ totalesFiltro().montoVendido | moneda: 'USD' : tipoCambio() }}</td>
            <td class="text-right font-bold whitespace-nowrap">{{ totalesFiltro().baseCalculo | moneda: 'USD' : tipoCambio() }}</td>
            <td></td>
            <td class="text-right font-extrabold text-primary text-base whitespace-nowrap">
              {{ formatearUsd(totalesFiltro().comisionUsd) }}
            </td>
          </tr>
        </tfoot>
      </app-table>
    }
  `,
  styles: `
    :host {
      display: block;
    }

    .desglose-filtros {
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 8px;
      margin-bottom: 12px;
    }

    .grupo-chips {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 6px;
    }

    .fila-totales {
      background: color-mix(in srgb, var(--color-primary) 5%, white);
    }
  `,
})
export class DesgloseComisionesComponent {
  readonly filas = input.required<readonly LineaDesgloseVendedora[]>();
  readonly tipoCambio = input<number>(1);

  protected readonly clasifLabel = CLASIF_LABEL;
  protected readonly canalLabel = CANAL_LABEL;
  protected readonly unidadLabel = UNIDAD_LABEL;
  protected readonly subtipoLabel = SUBTIPO_LABEL;
  protected readonly subtipos: Subtipo[] = ['A', 'A_RA', 'B', 'C'];
  protected readonly formatearUsd = formatearUsd;

  protected readonly filtroSubtipo = signal<Subtipo | null>(null);
  protected readonly filtroVendedora = signal<string | null>(null);

  protected onCambiarVendedora(valor: string): void {
    this.filtroVendedora.set(valor || null);
  }

  protected readonly ordenCampo = signal<CampoOrden>('comisionUsd');
  protected readonly ordenDireccion = signal<DireccionOrden>('desc');

  /** Nombre + id únicos, para el selector — deriva de las filas, no pide nada aparte. */
  protected readonly vendedoras = computed(() => {
    const vistos = new Map<string, string>();
    for (const f of this.filas()) vistos.set(f.vendedoraId, f.vendedoraNombre);
    return [...vistos.entries()]
      .map(([id, nombre]) => ({ id, nombre }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre));
  });

  /** Cuenta por subtipo ANTES de aplicar el propio filtro de subtipo — así el
   *  chip inactivo ya avisa cuántas líneas trae, igual que los chips de Unidad
   *  de negocio en la pestaña Clasificación. */
  protected readonly conteoPorSubtipo = computed(() => {
    const mapa = new Map<Subtipo, number>();
    for (const f of this.filas()) {
      if (this.filtroVendedora() && f.vendedoraId !== this.filtroVendedora()) continue;
      mapa.set(f.subtipo, (mapa.get(f.subtipo) ?? 0) + 1);
    }
    return mapa;
  });

  protected readonly filasVisibles = computed<readonly LineaDesgloseVendedora[]>(() => {
    const subtipo = this.filtroSubtipo();
    const vendedoraId = this.filtroVendedora();
    const filtradas = this.filas().filter(
      f => (!subtipo || f.subtipo === subtipo) && (!vendedoraId || f.vendedoraId === vendedoraId),
    );

    const campo = this.ordenCampo();
    const signo = this.ordenDireccion() === 'asc' ? 1 : -1;
    return [...filtradas].sort((a, b) => {
      const va = a[campo];
      const vb = b[campo];
      if (typeof va === 'string' || typeof vb === 'string') {
        return signo * String(va).localeCompare(String(vb));
      }
      return signo * (Number(va) - Number(vb));
    });
  });

  /** La sumatoria del filtro actual — la pregunta que motivó este componente. */
  protected readonly totalesFiltro = computed(() => {
    const filas = this.filasVisibles();
    return {
      cantidad: filas.reduce((s, f) => s + f.cantidad, 0),
      montoVendido: filas.reduce((s, f) => s + f.montoVendido, 0),
      baseCalculo: filas.reduce((s, f) => s + f.baseCalculo, 0),
      comisionUsd: filas.reduce((s, f) => s + f.comisionUsd, 0),
    };
  });

  protected alternarSubtipo(s: Subtipo): void {
    this.filtroSubtipo.set(this.filtroSubtipo() === s ? null : s);
  }

  protected ordenarPor(campo: CampoOrden): void {
    if (this.ordenCampo() === campo) {
      this.ordenDireccion.update(d => (d === 'asc' ? 'desc' : 'asc'));
      return;
    }
    this.ordenCampo.set(campo);
    this.ordenDireccion.set('desc');
  }
}
