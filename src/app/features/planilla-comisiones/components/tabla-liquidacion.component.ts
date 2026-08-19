import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { DecimalPipe } from '@angular/common';

import { InfoHintComponent } from '../../../shared/components/info-hint/info-hint.component';
import { TableComponent } from '../../../shared/components/table/table.component';
import { MonedaPipe } from '../../../shared/pipes/moneda.pipe';
import { FilaConsolidado } from '../planilla.model';

/**
 * La liquidación del mes, vendedora por vendedora.
 *
 * **Existe porque estaba duplicada.** La misma tabla vivía copiada en
 * `reportes.page.html` y en `planilla-comisiones.page.html`, y las dos copias
 * divergieron: al separar el bono trimestral se arregló solo una, así que
 * durante varias entregas la vista de Reportes seguía mostrando "sin objetivo",
 * los totales en Bs y los tres bonos sumados — y desde fuera parecía que los
 * cambios no se aplicaban. Una de las dos también acabó con una cabecera de más
 * que corría todos los datos una columna.
 *
 * Con un solo componente eso ya no puede volver a pasar: un arreglo llega a las
 * dos vistas o a ninguna.
 *
 * Es **presentacional**: recibe filas y totales ya calculados y no pide nada al
 * servidor. Quien lo usa decide de dónde salen los datos.
 */
@Component({
  selector: 'app-tabla-liquidacion',
  imports: [DecimalPipe, MonedaPipe, TableComponent, InfoHintComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-table [dense]="true" [maxHeight]="maxHeight()">
      <thead>
        <tr>
          <th class="text-left celda-fija">Vendedora</th>
          <th class="text-right">
            Facturado
            <app-info-hint titulo="Facturado y base de cálculo">
              <p>Lo cobrado en el mes, <strong>en dólares</strong> — la moneda del Excel de FileMaker.</p>
              <p>
                Las comisiones no se calculan sobre este número sino sobre la <strong>base</strong>,
                que es el monto menos el impuesto vigente.
              </p>
            </app-info-hint>
          </th>
          <th class="text-right">
            Planes
            <app-info-hint titulo="Objetivo de planes">
              <p>
                El objetivo es una <strong>franquicia</strong>: solo comisionan los planes que lo
                SUPERAN. Con 6 planes y objetivo 4, comisionan 2.
              </p>
              <p>Igualar el objetivo paga cero.</p>
            </app-info-hint>
          </th>
          @if (mostrarCirugias()) {
            <th class="text-right">
              Cirugías
              <app-info-hint titulo="Cirugías del mes">
                <p>
                  Acumulado de cirugías e internaciones, en dólares. Su <strong>nivel</strong> sale
                  de este monto —no del excedente sobre el objetivo— y decide el porcentaje.
                </p>
              </app-info-hint>
            </th>
          }
          <th class="text-right">Tipo A</th>
          <th class="text-right">Tipo B</th>
          <th class="text-right">Tipo C</th>
          <th class="text-right">
            Bono trimestral
            <app-info-hint titulo="Bono trimestral">
              <p>
                <strong>0,5 % del PROMEDIO</strong> de lo facturado en los tres meses del trimestre,
                no del mes que se liquida.
              </p>
              <p>
                Solo lo cobra quien promedia más de <strong>15.000 USD</strong>, y ese umbral es el
                mismo para todas — también para quien tiene objetivo mensual de 12.000.
              </p>
              <p>Se paga en marzo, junio, septiembre y diciembre.</p>
            </app-info-hint>
          </th>
          <th class="text-right">
            Otros bonos
            <app-info-hint titulo="Bono de jefatura y publicidad">
              <p>
                Cada vendedora que supera su objetivo mensual aporta un porcentaje de su
                <strong>excedente</strong> a una bolsa común.
              </p>
              <p>
                Esa bolsa se paga <strong>dos veces</strong>: íntegra a la jefatura, y otro tanto
                repartido entre el equipo de publicidad. Quien la genera no cobra de ella.
              </p>
            </app-info-hint>
          </th>
          <th class="text-right">Total USD</th>
          <th class="text-right">Total Bs</th>
          <th class="text-right">Sueldo</th>
          <th class="text-right">A pagar</th>
        </tr>
      </thead>

      <tbody>
        @for (f of filas(); track f.vendedoraId) {
          <tr>
            <td class="celda-fija">
              <span class="font-semibold text-sm text-text-dark block">{{ f.nombre }}</span>
              <span class="block text-[11px] text-text-muted font-normal">{{ f.tipo }} · {{ f.area }}</span>
            </td>

            <td class="text-right font-medium text-text-dark whitespace-nowrap">
              \${{ f.montoVendido | number: '1.2-2' }}
            </td>

            <td class="text-right whitespace-nowrap">
              <span class="font-medium text-text-dark">{{ f.planesVendidos }}</span>
              @if (planesInfo(f); as info) {
                <span
                  class="text-[10px] font-semibold block text-right"
                  [class.text-primary]="info.esComisionable"
                  [class.text-text-muted]="!info.esComisionable"
                  [title]="info.esComisionable ? 'Supera el objetivo comercial y genera comisión Tipo A' : 'El objetivo es una franquicia: solo comisionan los planes que lo SUPERAN.'">
                  {{ info.texto }}
                </span>
              }
            </td>

            @if (mostrarCirugias()) {
              <td class="text-right whitespace-nowrap">
                <span class="font-medium text-text-dark">\${{ f.acumuladoCirugias | number: '1.2-2' }}</span>
                @if (f.nivelCirugia) {
                  <span class="text-[10px] text-text-muted font-medium block text-right">
                    nivel {{ f.nivelCirugia }}
                  </span>
                }
              </td>
            }

            <td class="text-right whitespace-nowrap">\${{ f.comisionA | number: '1.2-2' }}</td>
            <td class="text-right whitespace-nowrap">\${{ f.comisionB | number: '1.2-2' }}</td>
            <td class="text-right whitespace-nowrap">\${{ f.comisionC | number: '1.2-2' }}</td>

            <td class="text-right whitespace-nowrap">
              <span class="font-medium text-text-dark">\${{ f.bonoTrimestral | number: '1.2-2' }}</span>
              @if (f.bonoTrimestral) {
                <span class="text-[10px] text-text-muted block text-right">
                  {{ f.bonoTrimestral * tipoCambio() | moneda }}
                </span>
              }
            </td>

            <td class="text-right whitespace-nowrap">
              \${{ f.bonoJefatura + f.bonoPublicidad | number: '1.2-2' }}
            </td>

            <td class="text-right font-semibold text-primary whitespace-nowrap">
              \${{ f.totalUsd | number: '1.2-2' }}
            </td>
            <td class="text-right font-medium text-text-dark whitespace-nowrap">{{ f.totalBob | moneda }}</td>
            <td class="text-right text-text-muted whitespace-nowrap">{{ f.sueldoBase | moneda }}</td>
            <td class="text-right font-extrabold text-secondary text-base whitespace-nowrap">
              {{ f.totalGanado | moneda }}
            </td>
          </tr>
        }
      </tbody>

      <tfoot>
        <tr class="fila-totales">
          <td class="text-left font-bold celda-fija">TOTALES</td>
          <td class="text-right font-bold whitespace-nowrap">\${{ totales()['montoVendido'] | number: '1.2-2' }}</td>
          <td></td>
          @if (mostrarCirugias()) {
            <td></td>
          }
          <td class="text-right font-bold whitespace-nowrap">\${{ totales()['comisionA'] | number: '1.2-2' }}</td>
          <td class="text-right font-bold whitespace-nowrap">\${{ totales()['comisionB'] | number: '1.2-2' }}</td>
          <td class="text-right font-bold whitespace-nowrap">\${{ totales()['comisionC'] | number: '1.2-2' }}</td>
          <td class="text-right font-bold whitespace-nowrap">\${{ totales()['bonoTrimestral'] | number: '1.2-2' }}</td>
          <td class="text-right font-bold whitespace-nowrap">\${{ otrosBonos() | number: '1.2-2' }}</td>
          <td class="text-right font-bold text-primary whitespace-nowrap">\${{ totales()['totalUsd'] | number: '1.2-2' }}</td>
          <td class="text-right font-bold whitespace-nowrap">{{ totales()['totalBob'] | moneda }}</td>
          <td class="text-right font-bold whitespace-nowrap">{{ totales()['sueldoBase'] | moneda }}</td>
          <td class="text-right font-extrabold text-secondary text-base whitespace-nowrap">
            {{ totales()['totalGanado'] | moneda }}
          </td>
        </tr>
      </tfoot>
    </app-table>
  `,
  styles: `
    :host {
      display: block;
      overflow-x: auto;
    }

    /* El nombre se queda fijo al desplazar en horizontal: con trece columnas,
       sin esto se pierde de vista de quién es cada cifra. */
    .celda-fija {
      position: sticky;
      left: 0;
      z-index: 2;
      background: var(--color-background);
    }

    .fila-totales {
      background: color-mix(in srgb, var(--color-primary) 5%, white);
      font-weight: 700;
    }

    .fila-totales .celda-fija {
      background: color-mix(in srgb, var(--color-primary) 5%, white);
    }
  `,
})
export class TablaLiquidacionComponent {
  readonly filas = input.required<readonly FilaConsolidado[]>();
  readonly totales = input.required<Record<string, number>>();

  /** Para mostrar el equivalente en bolivianos del bono trimestral. */
  readonly tipoCambio = input<number>(1);

  /** La columna de cirugías solo interesa en la planilla operativa. */
  readonly mostrarCirugias = input<boolean>(false);

  readonly maxHeight = input<string | undefined>(undefined);

  /** Jefatura + publicidad. El backend manda `bonos` con los tres sumados. */
  protected readonly otrosBonos = computed(() => {
    const t = this.totales();
    return (t['bonos'] ?? 0) - (t['bonoTrimestral'] ?? 0);
  });

  protected planesInfo(f: FilaConsolidado): { texto: string; esComisionable: boolean } | null {
    if (!f.planesVendidos || f.planesVendidos <= 0) return null;

    const comisionables = (Number(f.planpaqComisionables) || 0) + (Number(f.planninComisionables) || 0);
    if (comisionables > 0) {
      return {
        texto: `${comisionables} comisiona${comisionables === 1 ? '' : 'n'}`,
        esComisionable: true,
      };
    }

    if (f.comisionA > 0 || f.cumpleObjetivoPlanes) {
      return {
        texto: 'comisiona Tipo A',
        esComisionable: true,
      };
    }

    return {
      texto: 'no supera el objetivo',
      esComisionable: false,
    };
  }
}
