import { Pipe, PipeTransform } from '@angular/core';

/**
 * Moneda del sistema: Bolivianos (Bs), formato es-BO.
 * Única fuente de verdad del formato monetario — no formatear montos a mano en vistas.
 *
 * **Siempre dos decimales**, ni más ni menos. Sin fijarlos, `toLocaleString`
 * usa hasta tres y omite los que no hacen falta: un bono de 152,62 × 6,97 salía
 * como "Bs 1.063,761" y un sueldo de 2500 como "Bs 2.500". En una columna de
 * dinero eso descuadra la coma y obliga a leer cifra por cifra para comparar.
 */
export function formatearBs(valor: number | string): string {
  const num = typeof valor === 'string' ? parseFloat(valor) : valor;
  const seguro = isNaN(num) ? 0 : num;
  return `Bs ${seguro.toLocaleString('es-BO', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

@Pipe({ name: 'moneda' })
export class MonedaPipe implements PipeTransform {
  transform(valor: number | string): string {
    return formatearBs(valor);
  }
}
