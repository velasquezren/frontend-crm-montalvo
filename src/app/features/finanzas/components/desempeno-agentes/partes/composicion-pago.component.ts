import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { InfoHintComponent } from '../../../../../shared/components/info-hint/info-hint.component';
import { MonedaPipe } from '../../../../../shared/pipes/moneda.pipe';
import { FilaConsolidado } from '../../../../planilla-comisiones/planilla.model';

/** Un concepto del pago, ya normalizado a bolivianos. */
interface Concepto {
  readonly clave: string;
  readonly etiqueta: string;
  readonly detalle: string;
  readonly montoBob: number;
  /** Cuánto pesa sobre el total, 0-100. */
  readonly porcentaje: number;
}

/**
 * De qué está hecho el pago del mes: una sola barra y su leyenda.
 *
 * ## Por qué no es otra tabla de cifras
 *
 * Los importes por concepto ya están en el reporte consolidado, y repetirlos en
 * cinco casillas planas no añadía nada — solo obligaba a comparar dos pantallas.
 * Lo que ninguna otra vista responde es **cuánto pesa cada parte**: si el mes se
 * pagó sobre todo por el sueldo base o por las cirugías, y qué proporción son
 * los bonos. Eso es lo que decide una conversación sobre desempeño, y es lo que
 * dibuja la barra.
 *
 * ## Todo se normaliza a bolivianos, y por eso hace falta el tipo de cambio
 *
 * Los conceptos vienen mezclados: `sueldoBase` en bolivianos, las tres
 * comisiones y los bonos en dólares. Sumar unos con otros sin convertir daría
 * una barra con proporciones inventadas —el sueldo se vería siete veces menor de
 * lo que es—, así que se convierte con el tipo de cambio de ESTE periodo, que es
 * el mismo con el que el backend calculó el total.
 *
 * La composición cuadra por construcción, no por casualidad:
 *
 *   totalGanado = sueldoBase + (comisionA + comisionB + comisionC + bonos) × TC
 *
 * es literalmente cómo lo calcula `calculo-comisiones.service.ts`, así que los
 * porcentajes siempre suman 100 sin necesidad de un concepto "otros".
 */
@Component({
  selector: 'app-composicion-pago',
  imports: [DecimalPipe, InfoHintComponent, MonedaPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './composicion-pago.component.html',
  styleUrl: './composicion-pago.component.css',
})
export class ComposicionPagoComponent {
  readonly fila = input.required<FilaConsolidado>();
  /** El TC del periodo que se está viendo, para normalizar a bolivianos. */
  readonly tipoCambio = input.required<number>();

  protected readonly total = computed(() => this.fila().totalGanado);

  protected readonly conceptos = computed<readonly Concepto[]>(() => {
    const v = this.fila();
    const tc = this.tipoCambio();
    const total = v.totalGanado;

    const bruto = [
      {
        clave: 'sueldo',
        etiqueta: 'Sueldo base',
        detalle: 'Haber fijo del mes',
        montoBob: v.sueldoBase,
      },
      {
        clave: 'a',
        etiqueta: 'Tipo A · planes',
        detalle: 'Paquetes de maternidad y planes varios',
        montoBob: v.comisionA * tc,
      },
      {
        clave: 'b',
        etiqueta: 'Tipo B · cirugías',
        detalle: 'Cirugías e internaciones, por nivel',
        montoBob: v.comisionB * tc,
      },
      {
        clave: 'c',
        etiqueta: 'Tipo C · servicios',
        detalle: 'Consultas, laboratorio y ecografías',
        montoBob: v.comisionC * tc,
      },
      {
        clave: 'bonos',
        etiqueta: 'Bonos',
        detalle: 'Jefatura, publicidad y trimestral',
        montoBob: v.totalBonos * tc,
      },
    ];

    /* Los conceptos en cero se descartan: un segmento invisible con su fila de
       leyenda diciendo "Bs 0,00 · 0%" es ruido que hay que leer para descartar. */
    return bruto
      .filter(c => c.montoBob > 0)
      .map(c => ({ ...c, porcentaje: total > 0 ? (c.montoBob / total) * 100 : 0 }));
  });

  /** Si no hay nada que repartir, la barra no se dibuja. */
  protected readonly hayComposicion = computed(() => this.conceptos().length > 0);
}
