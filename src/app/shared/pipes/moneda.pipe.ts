import { Pipe, PipeTransform } from '@angular/core';

/**
 * Moneda del sistema: Bolivianos (Bs), formato es-BO.
 * Única fuente de verdad del formato monetario — no formatear montos a mano en vistas.
 */
export function formatearBs(valor: number | string): string {
  const num = typeof valor === 'string' ? parseFloat(valor) : valor;
  return `Bs ${(isNaN(num) ? 0 : num).toLocaleString('es-BO')}`;
}

@Pipe({ name: 'moneda' })
export class MonedaPipe implements PipeTransform {
  transform(valor: number | string): string {
    return formatearBs(valor);
  }
}
