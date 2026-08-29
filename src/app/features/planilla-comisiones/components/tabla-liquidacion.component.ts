import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';

import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { InfoHintComponent } from '../../../shared/components/info-hint/info-hint.component';
import { InputComponent } from '../../../shared/components/input/input.component';
import { TableComponent } from '../../../shared/components/table/table.component';
import { formatearBs, formatearUsd, MonedaPipe } from '../../../shared/pipes/moneda.pipe';
import { FilaConsolidado } from '../planilla.model';

/** Campos por los que se puede ordenar, en memoria — no hay paginación que romper. */
type CampoOrden =
  | 'nombre'
  | 'montoVendido'
  | 'planesVendidos'
  | 'acumuladoCirugias'
  | 'comisionA'
  | 'comisionTipoARA'
  | 'comisionB'
  | 'comisionC'
  | 'bonoTrimestral'
  | 'otrosBonos'
  | 'totalUsd'
  | 'totalBob'
  | 'sueldoBase'
  | 'totalGanado';

type DireccionOrden = 'asc' | 'desc';

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
 *
 * ## Orden y búsqueda son locales, y el patrón sale de `analitica.page.html`
 *
 * `filas()` llega COMPLETA — el consolidado de un periodo no se pagina, son
 * como mucho un puñado de vendedoras — así que ordenar y filtrar en memoria no
 * miente sobre nada que no esté en pantalla. Por eso este componente NO usa
 * `th[appOrdenable]` (`ThOrdenableComponent`): esa cabecera documenta
 * explícitamente que ordena el SERVIDOR, y usarla aquí contradiría lo que
 * promete en cualquier tabla paginada del CRM que sí la use.
 *
 * Para la cabecera ordenable local **no se inventó CSS nuevo**: es el mismo
 * patrón que ya usa `analitica.page.html` (mismo módulo de Finanzas) para su
 * tabla de categorías — clases Tailwind (`cursor-pointer select-none
 * hover:text-primary transition-colors`) más un `<app-icon>` condicional, sin
 * clases propias. La primera versión de este archivo sí se inventó un bloque
 * `.th-clic*` de 40 líneas que reproducía a mano el aspecto de
 * `ThOrdenableComponent` — duplicación evitable que ya existía resuelta a un
 * componente de distancia.
 *
 * ## La moneda se aplica UNA vez, salvo en la columna que ya la nombra
 *
 * Antes, la mitad de las columnas (`montoVendido`, las comisiones, `totalUsd`)
 * mostraban siempre "$…" con un `number` a mano, y la otra mitad (`totalBob`,
 * `sueldoBase`, `totalGanado`) sí pasaban por el pipe `moneda` y por eso sí
 * obedecían el selector Bs/$us del topbar. Con el selector en Bs, una misma
 * fila mezclaba dólares y bolivianos sin que nada lo explicara. Se unificó
 * para que las columnas de desglose (Facturado, Cirugías, Tipo A/B/C, los dos
 * bonos) sigan todas al selector con el mismo TC.
 *
 * **Pero "Total USD", "Total Bs", "Sueldo" y "A pagar" son la excepción, a
 * propósito.** Su encabezado YA nombra la moneda — no es un dato que el
 * selector deba traducir, es el resultado final que administración necesita
 * ver siempre en su moneda real: nadie paga un sueldo boliviano en dólares
 * porque alguien tocó un switch de la interfaz. Dejarlas seguir al selector
 * (como se hizo en la primera versión de este archivo) las volvía inútiles en
 * cuanto se tocaba el switch: con el selector en $us, "Total Bs" mostraba el
 * mismo número que "Total USD" — dos columnas para un solo dato, y la que
 * decía "Bs" mintiendo. Por eso estas cuatro usan `formatearUsd`/`formatearBs`
 * (sin pipe, sin TC, siempre esa moneda) y no `| moneda`.
 *
 * El selector de moneda en sí **no vive aquí ni en la página**: ya es global,
 * uno solo en el topbar (`layout.component.html`). Añadir uno propio habría
 * sido el mismo error de fondo que el bloque `.th-clic*` — dos controles
 * distintos gobernando el mismo estado.
 */
@Component({
  selector: 'app-tabla-liquidacion',
  imports: [MonedaPipe, TableComponent, InfoHintComponent, IconComponent, InputComponent, EmptyStateComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex items-center justify-between gap-3 mb-2.5 flex-wrap">
      <div class="tabla-liquidacion-buscador">
        <app-input type="search" placeholder="Buscar vendedora…" [(value)]="busqueda" />
      </div>
      <div class="text-xs text-text-muted font-medium">
        {{ filasVisibles().length }} de {{ filas().length }} vendedoras
      </div>
    </div>

    <app-table [dense]="true" [maxHeight]="maxHeight()">
      <thead>
        <tr>
          <th class="text-left celda-fija cursor-pointer select-none hover:text-primary transition-colors" (click)="ordenarPor('nombre')">
            Vendedora
            @if (ordenCampo() === 'nombre') {
              <app-icon name="chevron-down" [size]="13" class="inline ml-0.5 text-primary transition-transform duration-200" [class.rotate-180]="ordenDireccion() === 'asc'" />
            }
          </th>
          <th class="text-right cursor-pointer select-none hover:text-primary transition-colors" (click)="ordenarPor('montoVendido')">
            Facturado
            @if (ordenCampo() === 'montoVendido') {
              <app-icon name="chevron-down" [size]="13" class="inline ml-0.5 text-primary transition-transform duration-200" [class.rotate-180]="ordenDireccion() === 'asc'" />
            }
            <app-info-hint titulo="Facturado y base de cálculo">
              <p>Lo cobrado en el mes, convertido con el tipo de cambio del periodo.</p>
              <p>
                Las comisiones no se calculan sobre este número sino sobre la <strong>base</strong>,
                que es el monto menos el impuesto vigente.
              </p>
            </app-info-hint>
          </th>
          <th class="text-right cursor-pointer select-none hover:text-primary transition-colors" (click)="ordenarPor('planesVendidos')">
            Planes
            @if (ordenCampo() === 'planesVendidos') {
              <app-icon name="chevron-down" [size]="13" class="inline ml-0.5 text-primary transition-transform duration-200" [class.rotate-180]="ordenDireccion() === 'asc'" />
            }
            <app-info-hint titulo="Cuántos planes comisionan">
              <p>
                El objetivo es una <strong>franquicia</strong>: solo comisionan los que lo
                SUPERAN. Igualarlo paga cero.
              </p>
              <p>
                Y son <strong>dos objetivos distintos</strong>, que se cuentan por
                separado: uno para <strong>paquetes</strong> de maternidad y otro
                para <strong>planes varios</strong>. El número de esta columna es
                la suma de los dos.
              </p>
              <p>
                Por eso puede parecer alto: el objetivo de planes varios es 1, así
                que casi todos superan. Con 1 paquete (objetivo 6) y 7 planes
                varios (objetivo 1) comisionan 6 — ninguno del primero, seis del
                segundo.
              </p>
              <p>
                Los que comisionan son los <strong>últimos vendidos</strong>, y cada
                uno paga con <strong>su</strong> base y <strong>su</strong> tarifa —
                no se promedian. La base es el precio entero menos el 13 %, sin
                importar cuánto se pagó de anticipo ni cuánto queda debiendo.
              </p>
              <p>
                Pasa el ratón por la cifra para ver el desglose de cada vendedora,
                o entra en "Planes que comisionan" para ver cuáles son.
              </p>
            </app-info-hint>
          </th>
          @if (mostrarCirugias()) {
            <th class="text-right cursor-pointer select-none hover:text-primary transition-colors" (click)="ordenarPor('acumuladoCirugias')">
              Cirugías
              @if (ordenCampo() === 'acumuladoCirugias') {
                <app-icon name="chevron-down" [size]="13" class="inline ml-0.5 text-primary transition-transform duration-200" [class.rotate-180]="ordenDireccion() === 'asc'" />
              }
              <app-info-hint titulo="Cirugías del mes">
                <p>
                  Acumulado de cirugías e internaciones. Su <strong>nivel</strong> sale
                  de este monto —no del excedente sobre el objetivo— y decide el porcentaje.
                </p>
              </app-info-hint>
            </th>
          }
          <th class="text-right cursor-pointer select-none hover:text-primary transition-colors" (click)="ordenarPor('comisionA')">
            Tipo A
            @if (ordenCampo() === 'comisionA') {
              <app-icon name="chevron-down" [size]="13" class="inline ml-0.5 text-primary transition-transform duration-200" [class.rotate-180]="ordenDireccion() === 'asc'" />
            }
          </th>
          <th class="text-right cursor-pointer select-none hover:text-primary transition-colors" (click)="ordenarPor('comisionTipoARA')">
            Tipo A (RA)
            @if (ordenCampo() === 'comisionTipoARA') {
              <app-icon name="chevron-down" [size]="13" class="inline ml-0.5 text-primary transition-transform duration-200" [class.rotate-180]="ordenDireccion() === 'asc'" />
            }
            <app-info-hint titulo="Tipo A (RA)">
              <p>
                No es la misma comisión que <strong>Tipo A</strong>: esta paga aparte, sobre las
                ventas del área RA que <strong>no</strong> son cirugía (consulta, laboratorio,
                ecografía, otros).
              </p>
              <p>
                Se suma el ingreso de planes de maternidad con el de esas ventas RA. Si esa suma
                supera el <strong>objetivo mensual en $</strong> de la vendedora, el excedente cae
                en una escala de niveles —igual que Tipo B— y ese porcentaje se cobra
                <strong>solo sobre la porción RA</strong>, no sobre los planes.
              </p>
            </app-info-hint>
          </th>
          <th class="text-right cursor-pointer select-none hover:text-primary transition-colors" (click)="ordenarPor('comisionB')">
            Tipo B
            @if (ordenCampo() === 'comisionB') {
              <app-icon name="chevron-down" [size]="13" class="inline ml-0.5 text-primary transition-transform duration-200" [class.rotate-180]="ordenDireccion() === 'asc'" />
            }
          </th>
          <th class="text-right cursor-pointer select-none hover:text-primary transition-colors" (click)="ordenarPor('comisionC')">
            Tipo C
            @if (ordenCampo() === 'comisionC') {
              <app-icon name="chevron-down" [size]="13" class="inline ml-0.5 text-primary transition-transform duration-200" [class.rotate-180]="ordenDireccion() === 'asc'" />
            }
          </th>
          <th class="text-right cursor-pointer select-none hover:text-primary transition-colors" (click)="ordenarPor('bonoTrimestral')">
            Bono trimestral
            @if (ordenCampo() === 'bonoTrimestral') {
              <app-icon name="chevron-down" [size]="13" class="inline ml-0.5 text-primary transition-transform duration-200" [class.rotate-180]="ordenDireccion() === 'asc'" />
            }
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
          <th class="text-right cursor-pointer select-none hover:text-primary transition-colors" (click)="ordenarPor('otrosBonos')">
            Otros bonos
            @if (ordenCampo() === 'otrosBonos') {
              <app-icon name="chevron-down" [size]="13" class="inline ml-0.5 text-primary transition-transform duration-200" [class.rotate-180]="ordenDireccion() === 'asc'" />
            }
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
          <th class="text-right cursor-pointer select-none hover:text-primary transition-colors" (click)="ordenarPor('totalUsd')">
            Total USD
            @if (ordenCampo() === 'totalUsd') {
              <app-icon name="chevron-down" [size]="13" class="inline ml-0.5 text-primary transition-transform duration-200" [class.rotate-180]="ordenDireccion() === 'asc'" />
            }
          </th>
          <th class="text-right cursor-pointer select-none hover:text-primary transition-colors" (click)="ordenarPor('totalBob')">
            Total Bs
            @if (ordenCampo() === 'totalBob') {
              <app-icon name="chevron-down" [size]="13" class="inline ml-0.5 text-primary transition-transform duration-200" [class.rotate-180]="ordenDireccion() === 'asc'" />
            }
          </th>
          <th class="text-right cursor-pointer select-none hover:text-primary transition-colors" (click)="ordenarPor('sueldoBase')">
            Sueldo
            @if (ordenCampo() === 'sueldoBase') {
              <app-icon name="chevron-down" [size]="13" class="inline ml-0.5 text-primary transition-transform duration-200" [class.rotate-180]="ordenDireccion() === 'asc'" />
            }
          </th>
          <th class="text-right celda-fija-der cursor-pointer select-none hover:text-primary transition-colors" (click)="ordenarPor('totalGanado')">
            A pagar
            @if (ordenCampo() === 'totalGanado') {
              <app-icon name="chevron-down" [size]="13" class="inline ml-0.5 text-primary transition-transform duration-200" [class.rotate-180]="ordenDireccion() === 'asc'" />
            }
          </th>
        </tr>
      </thead>

      <tbody>
        @for (f of filasVisibles(); track f.vendedoraId) {
          <tr>
            <td class="celda-fija">
              <span class="font-semibold text-sm text-text-dark block">{{ f.nombre }}</span>
              <span class="block text-[11px] text-text-muted font-normal">{{ f.tipo }} · {{ f.area }}</span>
            </td>

            <td class="text-right font-medium text-text-dark whitespace-nowrap">
              {{ f.montoVendido | moneda: 'USD' : tipoCambio() }}
            </td>

            <td class="text-right whitespace-nowrap">
              <span class="font-medium text-text-dark">{{ f.planesVendidos }}</span>
              @if (planesInfo(f); as info) {
                <span
                  class="text-[10px] font-semibold block text-right"
                  [class.text-primary]="info.esComisionable"
                  [class.text-text-muted]="!info.esComisionable"
                  [title]="desglosePlanes(f)">
                  {{ info.texto }}
                </span>
              }
            </td>

            @if (mostrarCirugias()) {
              <td class="text-right whitespace-nowrap">
                <span class="font-medium text-text-dark">{{ f.acumuladoCirugias | moneda: 'USD' : tipoCambio() }}</span>
                @if (f.nivelCirugia) {
                  <span class="text-[10px] text-text-muted font-medium block text-right">
                    nivel {{ f.nivelCirugia }}
                  </span>
                }
              </td>
            }

            <td class="text-right whitespace-nowrap">{{ f.comisionA | moneda: 'USD' : tipoCambio() }}</td>
            <td class="text-right whitespace-nowrap">
              {{ f.comisionTipoARA | moneda: 'USD' : tipoCambio() }}
              @if (f.nivelTipoARA) {
                <span class="text-[10px] text-text-muted font-medium block text-right">
                  nivel {{ f.nivelTipoARA }}
                </span>
              }
            </td>
            <td class="text-right whitespace-nowrap">{{ f.comisionB | moneda: 'USD' : tipoCambio() }}</td>
            <td class="text-right whitespace-nowrap">{{ f.comisionC | moneda: 'USD' : tipoCambio() }}</td>

            <td class="text-right whitespace-nowrap">
              <span class="font-medium text-text-dark">{{ f.bonoTrimestral | moneda: 'USD' : tipoCambio() }}</span>
            </td>

            <td class="text-right whitespace-nowrap">
              {{ f.bonoJefatura + f.bonoPublicidad | moneda: 'USD' : tipoCambio() }}
            </td>

            <td class="text-right font-semibold text-primary whitespace-nowrap">
              {{ formatearUsd(f.totalUsd) }}
            </td>
            <td class="text-right font-medium text-text-dark whitespace-nowrap">{{ formatearBs(f.totalBob) }}</td>
            <td class="text-right text-text-muted whitespace-nowrap">{{ formatearBs(f.sueldoBase) }}</td>
            <td class="text-right font-extrabold text-secondary text-base whitespace-nowrap celda-fija-der">
              {{ formatearBs(f.totalGanado) }}
            </td>
          </tr>
        } @empty {
          <tr>
            <td [attr.colspan]="mostrarCirugias() ? 14 : 13" class="py-6">
              <app-empty-state
                icon="search"
                title="Sin coincidencias"
                [description]="'Ninguna vendedora coincide con «' + busqueda() + '».'" />
            </td>
          </tr>
        }
      </tbody>

      <tfoot>
        <tr class="fila-totales">
          <td class="text-left font-bold celda-fija">TOTALES</td>
          <td class="text-right font-bold whitespace-nowrap">{{ totales()['montoVendido'] | moneda: 'USD' : tipoCambio() }}</td>
          <td></td>
          @if (mostrarCirugias()) {
            <td></td>
          }
          <td class="text-right font-bold whitespace-nowrap">{{ totales()['comisionA'] | moneda: 'USD' : tipoCambio() }}</td>
          <td class="text-right font-bold whitespace-nowrap">{{ totales()['comisionTipoARA'] | moneda: 'USD' : tipoCambio() }}</td>
          <td class="text-right font-bold whitespace-nowrap">{{ totales()['comisionB'] | moneda: 'USD' : tipoCambio() }}</td>
          <td class="text-right font-bold whitespace-nowrap">{{ totales()['comisionC'] | moneda: 'USD' : tipoCambio() }}</td>
          <td class="text-right font-bold whitespace-nowrap">{{ totales()['bonoTrimestral'] | moneda: 'USD' : tipoCambio() }}</td>
          <td class="text-right font-bold whitespace-nowrap">{{ otrosBonos() | moneda: 'USD' : tipoCambio() }}</td>
          <td class="text-right font-bold text-primary whitespace-nowrap">{{ formatearUsd(totales()['totalUsd']) }}</td>
          <td class="text-right font-bold whitespace-nowrap">{{ formatearBs(totales()['totalBob']) }}</td>
          <td class="text-right font-bold whitespace-nowrap">{{ formatearBs(totales()['sueldoBase']) }}</td>
          <td class="text-right font-extrabold text-secondary text-base whitespace-nowrap celda-fija-der">
            {{ formatearBs(totales()['totalGanado']) }}
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

    .tabla-liquidacion-buscador {
      max-width: 280px;
    }

    /* El nombre se queda fijo al desplazar a la izquierda */
    .celda-fija {
      position: sticky;
      left: 0;
      z-index: 3;
      background: var(--color-background);
      box-shadow: 2px 0 6px -2px rgba(0, 0, 0, 0.08);
      border-right: 1px solid var(--color-border);
    }

    /* La columna A PAGAR se queda fija a la derecha */
    .celda-fija-der {
      position: sticky;
      right: 0;
      z-index: 3;
      background: var(--color-background);
      box-shadow: -2px 0 6px -2px rgba(0, 0, 0, 0.08);
      border-left: 1px solid var(--color-border);
    }

    .fila-totales {
      background: color-mix(in srgb, var(--color-primary) 5%, white);
      font-weight: 700;
    }

    .fila-totales .celda-fija,
    .fila-totales .celda-fija-der {
      background: color-mix(in srgb, var(--color-primary) 5%, white);
    }
  `,
})
export class TablaLiquidacionComponent {
  readonly filas = input.required<readonly FilaConsolidado[]>();
  readonly totales = input.required<Record<string, number>>();

  /** Para convertir las columnas nativas en USD cuando el selector está en Bs. */
  readonly tipoCambio = input<number>(1);

  /** La columna de cirugías solo interesa en la planilla operativa. */
  readonly mostrarCirugias = input<boolean>(false);

  readonly maxHeight = input<string | undefined>(undefined);

  /** "Total USD"/"Total Bs"/"Sueldo"/"A pagar": moneda fija en el nombre de
   *  la columna, no siguen el selector del topbar. Ver el porqué arriba. */
  protected readonly formatearUsd = formatearUsd;
  protected readonly formatearBs = formatearBs;

  protected readonly busqueda = signal('');
  protected readonly ordenCampo = signal<CampoOrden>('totalGanado');
  protected readonly ordenDireccion = signal<DireccionOrden>('desc');

  /** Jefatura + publicidad. El backend manda `bonos` con los tres sumados. */
  protected readonly otrosBonos = computed(() => {
    const t = this.totales();
    return (t['bonos'] ?? 0) - (t['bonoTrimestral'] ?? 0);
  });

  /**
   * Filas buscadas y ordenadas. Todo en memoria: `filas()` ya trae el
   * consolidado completo del periodo, así que ni el filtro ni el orden dejan
   * fuera nada que no esté también fuera de la vista.
   */
  protected readonly filasVisibles = computed<readonly FilaConsolidado[]>(() => {
    const texto = this.busqueda().trim().toLowerCase();
    const filtradas = texto
      ? this.filas().filter(
          f => f.nombre.toLowerCase().includes(texto) || f.codigo.toLowerCase().includes(texto),
        )
      : this.filas();

    const campo = this.ordenCampo();
    const signo = this.ordenDireccion() === 'asc' ? 1 : -1;

    return [...filtradas].sort((a, b) => {
      const va = this.valorDeCampo(a, campo);
      const vb = this.valorDeCampo(b, campo);
      if (typeof va === 'string' || typeof vb === 'string') {
        return signo * String(va).localeCompare(String(vb));
      }
      return signo * (va - vb);
    });
  });

  private valorDeCampo(f: FilaConsolidado, campo: CampoOrden): number | string {
    if (campo === 'nombre') return f.nombre;
    if (campo === 'otrosBonos') return f.bonoJefatura + f.bonoPublicidad;
    return f[campo];
  }

  /** Sobre la columna activa invierte; sobre una nueva empieza descendente —
   *  mismo criterio que `ordenarClasif` en `analitica.page.ts`. */
  protected ordenarPor(campo: CampoOrden): void {
    if (this.ordenCampo() === campo) {
      this.ordenDireccion.update(d => (d === 'asc' ? 'desc' : 'asc'));
      return;
    }
    this.ordenCampo.set(campo);
    this.ordenDireccion.set('desc');
  }

  /**
   * Desglose de los dos cálculos que esta columna resume en un número.
   *
   * Paquetes y planes varios tienen objetivos distintos y se cuentan por
   * separado; la celda muestra la suma. Sin el desglose, ver "6 comisionan" de 8
   * planes no se puede reconstruir, y parece que hay una regla escondida.
   */
  protected desglosePlanes(f: FilaConsolidado): string {
    const paq = Number(f.planpaqVendidos) || 0;
    const paqCom = Number(f.planpaqComisionables) || 0;
    const nin = Number(f.planninVendidos) || 0;
    const ninCom = Number(f.planninComisionables) || 0;
    return `${paq} paquete(s) → ${paqCom} comisiona(n) · ${nin} plan(es) varios → ${ninCom} comisiona(n)`;
  }

  protected planesInfo(f: FilaConsolidado): { texto: string; esComisionable: boolean } | null {
    if (!f.planesVendidos || f.planesVendidos <= 0) return null;

    const comisionables = (Number(f.planpaqComisionables) || 0) + (Number(f.planninComisionables) || 0);
    if (comisionables > 0) {
      return {
        texto: `${comisionables} comisiona${comisionables === 1 ? '' : 'n'}`,
        esComisionable: true,
      };
    }

    if (Number(f.comisionA) > 0) {
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
