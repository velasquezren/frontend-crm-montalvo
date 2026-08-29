import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, input, signal } from '@angular/core';

import { BadgeComponent } from '../../../../../shared/components/badge/badge.component';
import { EmptyStateComponent } from '../../../../../shared/components/empty-state/empty-state.component';
import { FilterChipComponent } from '../../../../../shared/components/filter-chip/filter-chip.component';
import { InputComponent } from '../../../../../shared/components/input/input.component';
import { LoadingSkeletonComponent } from '../../../../../shared/components/loading-skeleton/loading-skeleton.component';
import { TableComponent } from '../../../../../shared/components/table/table.component';
import { MonedaPipe } from '../../../../../shared/pipes/moneda.pipe';
import {
  CLASIF_LABEL,
  ClasifComision,
  TIPO_LABEL,
  TipoComision,
  VentaImportada,
} from '../../../../planilla-comisiones/planilla.model';

/** Reparto por canal del mes, agregado por el servidor. */
export interface RepartoCanal {
  readonly total: number;
  readonly propios: number;
  readonly empresa: number;
  readonly pctPropio: number;
}

type Canal = 'TODOS' | 'EMPRESA' | 'PROPIO';

/**
 * Las ventas del mes de una ejecutiva, con su buscador y su filtro de canal.
 *
 * Vive aparte del resto de la ficha porque es lo único de la pantalla que tiene
 * estado propio —texto buscado y canal— y lo único que se repinta al teclear.
 * Mientras estaba en la plantilla del padre, cada pulsación reevaluaba también
 * la cabecera, las metas y la composición del pago, que no dependen del texto.
 *
 * El filtro corre en memoria porque el padre trae el mes entero (`mesCompleto`),
 * y eso es a propósito: con una página de 100 filas, la ejecutiva con 418 ventas
 * tenía 318 invisibles y el buscador respondía "no existe" a servicios que sí
 * existían.
 */
@Component({
  selector: 'app-ventas-agente',
  imports: [
    DatePipe,
    MonedaPipe,
    BadgeComponent,
    EmptyStateComponent,
    FilterChipComponent,
    InputComponent,
    LoadingSkeletonComponent,
    TableComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './ventas-agente.component.html',
  styleUrl: './ventas-agente.component.css',
})
export class VentasAgenteComponent {
  readonly ventas = input.required<readonly VentaImportada[]>();
  readonly cargando = input(false);
  readonly codigoVendedora = input.required<string>();
  readonly canales = input<RepartoCanal | null>(null);

  protected readonly clasifLabel = CLASIF_LABEL;
  protected readonly tipoLabel = TIPO_LABEL;

  protected readonly busqueda = signal('');
  protected readonly filtroCanal = signal<Canal>('TODOS');

  /**
   * Lo que de verdad filtra, un instante después de teclear.
   *
   * 150 ms, no los 350 de la planilla: allí el retardo protege una llamada al
   * servidor y conviene esperar a que la persona termine de escribir; aquí no
   * viaja nada, así que solo hay que saltarse las pulsaciones intermedias sin
   * que se sienta lento.
   */
  private readonly busquedaAplicada = signal('');

  constructor() {
    effect(onCleanup => {
      const texto = this.busqueda();
      const id = setTimeout(() => this.busquedaAplicada.set(texto), 150);
      onCleanup(() => clearTimeout(id));
    });
  }

  /**
   * Cuántas ventas del mes quedaron fuera del cálculo.
   *
   * Se muestra porque explica una diferencia que si no desconcierta: el contador
   * de captación cuenta solo comisionables —para cuadrar con lo que se paga—
   * mientras esta tabla las lista todas. En 39 de las 67 combinaciones
   * vendedora-mes de la base los dos números no coinciden, hasta por 21 filas.
   */
  protected readonly excluidas = computed(
    () => this.ventas().filter(v => !v.comisionable).length,
  );

  /**
   * Cuántas ventas caen en cada canal, para que los chips lleven su número.
   *
   * Se cuenta sobre lo que YA está en memoria —el mes entero—, así que no cuesta
   * una petición ni depende del texto buscado: los contadores dicen cuántas hay
   * en total por canal, no cuántas quedarían tras el filtro, que es lo que se
   * espera de un selector. Un chip en cero avisa de que pulsarlo vacía la tabla
   * antes de pulsarlo.
   */
  protected readonly conteoCanal = computed(() => {
    let propio = 0;
    for (const v of this.ventas()) if (v.canal === 'PROPIO') propio++;
    const total = this.ventas().length;
    return { TODOS: total, PROPIO: propio, EMPRESA: total - propio };
  });

  protected readonly filtradas = computed<readonly VentaImportada[]>(() => {
    const texto = this.busquedaAplicada().trim().toLowerCase();
    const canal = this.filtroCanal();
    const lista = this.ventas();

    if (!texto && canal === 'TODOS') return lista;

    return lista.filter(v => {
      if (canal !== 'TODOS' && v.canal !== canal) return false;
      if (!texto) return true;
      return (
        v.detalle.toLowerCase().includes(texto) ||
        (v.paciente ?? '').toLowerCase().includes(texto) ||
        this.codigo(v).toLowerCase().includes(texto) ||
        (this.clasifLabel[v.clasif] ?? '').toLowerCase().includes(texto)
      );
    });
  });

  /** El código con el que administración identifica la venta en FileMaker. */
  protected codigo(v: VentaImportada): string {
    return v.codOrigen || v.codItem || v.id.slice(0, 8);
  }

  protected etiquetaClasif(clasif: string): string {
    return this.clasifLabel[clasif as ClasifComision] ?? clasif;
  }

  protected etiquetaTipo(tipo: string): string {
    return this.tipoLabel[tipo as TipoComision] ?? tipo;
  }
}
