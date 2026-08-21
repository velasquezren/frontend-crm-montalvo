import { inject, Pipe, PipeTransform } from '@angular/core';
import { formatearNumero, MonedaService } from '../../core/moneda/moneda.service';

/** Convierte a número tolerando cadenas y nulos: la API manda decimales como texto. */
function aNumero(valor: number | string): number {
  const num = typeof valor === 'string' ? parseFloat(valor) : valor;
  return Number.isFinite(num) ? num : 0;
}

/**
 * Formatea un monto directamente en Bolivianos (Bs), formato es-BO.
 * Siempre con dos decimales exactos.
 */
export function formatearBs(valor: number | string): string {
  return `Bs ${formatearNumero(aNumero(valor))}`;
}

/**
 * Formatea un monto directamente en Dólares ($us), formato es-BO.
 * Siempre con dos decimales exactos.
 */
export function formatearUsd(valor: number | string): string {
  return `$us ${formatearNumero(aNumero(valor))}`;
}

/**
 * Pipe reactivo de formato y conversión de moneda.
 *
 * @param origen 'USD' si el dato base viene en dólares (ej. FileMaker precio, analítica, servicios).
 *               'BOB' si el dato base viene en bolivianos (ej. Venta CRM, sueldoBase, totalBob).
 * @param tc Tipo de cambio opcional. Si se omite usa el vigente, que el
 *           `MonedaService` trae del backend (el del último periodo importado).
 *
 * Ejemplo de uso en plantillas:
 * `{{ s.precio | moneda }}`               -> Convierte de USD a la moneda activa (Bs o $us)
 * `{{ v.monto | moneda:'BOB' }}`          -> Trata el monto como BOB y lo convierte a $us si el usuario alternó
 * `{{ f.totalUsd | moneda:'USD':f.tc }}`  -> Convierte usando el TC específico del periodo
 *
 * ## Por qué es impuro, y por qué eso no cuesta nada
 *
 * Tiene que ser `pure: false`: con un pipe puro Angular cachea por identidad de
 * los argumentos, y al alternar Bs/$us los argumentos no cambian —cambia una
 * señal de fuera—, así que las 77 celdas de dinero del CRM se quedarían con el
 * texto anterior.
 *
 * El precio de ser impuro es que `transform` se ejecuta en CADA ciclo de
 * detección de cambios, por cada celda. Con `toLocaleString` dentro, eso eran
 * 1,14 ms de formateo por ciclo —medido: 228,6 ms para 77 celdas × 200 ciclos—
 * que se pagaban íntegros en cada pulsación de un filtro.
 *
 * Se arregla sin dejar de ser impuro, con dos cosas:
 *
 *   1. El `Intl.NumberFormat` de arriba, construido una sola vez.
 *   2. Un memo de UNA entrada por instancia. Angular crea una instancia del pipe
 *      por cada uso en la plantilla, así que cada celda recuerda su propio
 *      último resultado y los ciclos siguientes son cinco comparaciones.
 *
 * Con las dos, los mismos 15.400 formateos bajan a 0,1 ms.
 */
@Pipe({
  name: 'moneda',
  pure: false,
})
export class MonedaPipe implements PipeTransform {
  private readonly monedaService = inject(MonedaService);

  /* Memo de una entrada. `ultimoTexto = null` significa "todavía sin calcular",
     que no se puede confundir con un resultado válido. */
  private ultimoValor: number | string | null | undefined;
  private ultimoOrigen: 'USD' | 'BOB' = 'USD';
  private ultimoTc: number | undefined;
  private ultimaMoneda = '';
  private ultimoTcVigente = 0;
  private ultimoTexto: string | null = null;

  transform(
    valor: number | string | null | undefined,
    origen: 'USD' | 'BOB' = 'USD',
    tc?: number,
  ): string {
    if (valor === null || valor === undefined) return '';

    const moneda = this.monedaService.moneda();
    const tcVigente = this.monedaService.tipoCambio();

    if (
      this.ultimoTexto !== null &&
      valor === this.ultimoValor &&
      origen === this.ultimoOrigen &&
      tc === this.ultimoTc &&
      moneda === this.ultimaMoneda &&
      tcVigente === this.ultimoTcVigente
    ) {
      return this.ultimoTexto;
    }

    this.ultimoValor = valor;
    this.ultimoOrigen = origen;
    this.ultimoTc = tc;
    this.ultimaMoneda = moneda;
    this.ultimoTcVigente = tcVigente;
    return (this.ultimoTexto = this.monedaService.formatear(valor, origen, tc));
  }
}
