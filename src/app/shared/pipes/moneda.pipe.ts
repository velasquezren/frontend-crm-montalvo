import { inject, Pipe, PipeTransform } from '@angular/core';
import { MonedaService } from '../../core/moneda/moneda.service';

/**
 * Formatea un monto directamente en Bolivianos (Bs), formato es-BO.
 * Siempre con dos decimales exactos.
 */
export function formatearBs(valor: number | string): string {
  const num = typeof valor === 'string' ? parseFloat(valor) : valor;
  const seguro = isNaN(num) ? 0 : num;
  return `Bs ${seguro.toLocaleString('es-BO', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * Formatea un monto directamente en Dólares ($us), formato es-BO.
 * Siempre con dos decimales exactos.
 */
export function formatearUsd(valor: number | string): string {
  const num = typeof valor === 'string' ? parseFloat(valor) : valor;
  const seguro = isNaN(num) ? 0 : num;
  return `$us ${seguro.toLocaleString('es-BO', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * Pipe reactivo de formato y conversión de moneda.
 *
 * @param origen 'USD' si el dato base viene en dólares (ej. FileMaker precio, analítica, servicios).
 *               'BOB' si el dato base viene en bolivianos (ej. Venta CRM, sueldoBase, totalBob).
 * @param tc Tipo de cambio opcional (si se omite, usa el del MonedaService / 6.97).
 *
 * Ejemplo de uso en plantillas:
 * `{{ s.precio | moneda }}`               -> Convierte de USD a la moneda activa (Bs o $us)
 * `{{ v.monto | moneda:'BOB' }}`          -> Trata el monto como BOB y lo convierte a $us si el usuario alternó
 * `{{ f.totalUsd | moneda:'USD':f.tc }}`  -> Convierte usando el TC específico del periodo
 */
@Pipe({
  name: 'moneda',
  standalone: true,
  pure: false, // Reactivo a los cambios de señal en MonedaService sin recargar
})
export class MonedaPipe implements PipeTransform {
  private readonly monedaService = inject(MonedaService);

  transform(valor: number | string | null | undefined, origen: 'USD' | 'BOB' = 'USD', tc?: number): string {
    if (valor === null || valor === undefined) return '';
    return this.monedaService.formatear(valor, origen, tc);
  }
}
