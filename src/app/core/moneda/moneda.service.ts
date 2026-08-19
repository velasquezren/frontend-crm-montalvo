import { Injectable, computed, signal } from '@angular/core';

export type MonedaVisualizacion = 'BOB' | 'USD';

const CLAVE_STORAGE = 'crm_moneda_visualizacion';
export const TIPO_CAMBIO_POR_DEFECTO = 6.97;

/**
 * Servicio central para el selector de moneda (Bs / $us).
 * Permite alternar visualmente entre Bolivianos y Dólares en todo el CRM
 * sin alterar la base de datos ni las fórmulas de comisiones.
 */
@Injectable({ providedIn: 'root' })
export class MonedaService {
  private readonly _moneda = signal<MonedaVisualizacion>(this.cargarMonedaInicial());
  private readonly _tipoCambio = signal<number>(TIPO_CAMBIO_POR_DEFECTO);

  /** Moneda activa actualmente: 'BOB' (Bolivianos) o 'USD' (Dólares). */
  readonly moneda = this._moneda.asReadonly();
  /** Tipo de cambio oficial vigente (por defecto 6.97). */
  readonly tipoCambio = this._tipoCambio.asReadonly();

  /** True si la visualización activa es en Bolivianos. */
  readonly esBob = computed(() => this._moneda() === 'BOB');
  /** True si la visualización activa es en Dólares. */
  readonly esUsd = computed(() => this._moneda() === 'USD');

  /**
   * Cambia la moneda activa y la persiste en localStorage.
   */
  setMoneda(nuevaMoneda: MonedaVisualizacion): void {
    if (this._moneda() === nuevaMoneda) return;
    this._moneda.set(nuevaMoneda);
    try {
      localStorage.setItem(CLAVE_STORAGE, nuevaMoneda);
    } catch {
      // Ignorar si localStorage no está disponible
    }
  }

  /**
   * Actualiza el tipo de cambio (ej. cuando se carga un periodo con TC específico).
   */
  setTipoCambio(tc: number): void {
    if (tc > 0 && !isNaN(tc)) {
      this._tipoCambio.set(tc);
    }
  }

  /**
   * Convierte un monto cuyo origen está en Dólares (USD) a la moneda visual activa.
   */
  convertirDeUsd(montoUsd: number | string, tc?: number): number {
    const num = typeof montoUsd === 'string' ? parseFloat(montoUsd) : montoUsd;
    const seguro = isNaN(num) ? 0 : num;
    const tipo = tc && tc > 0 ? tc : this._tipoCambio();
    return this._moneda() === 'BOB' ? seguro * tipo : seguro;
  }

  /**
   * Convierte un monto cuyo origen está en Bolivianos (BOB) a la moneda visual activa.
   */
  convertirDeBob(montoBob: number | string, tc?: number): number {
    const num = typeof montoBob === 'string' ? parseFloat(montoBob) : montoBob;
    const seguro = isNaN(num) ? 0 : num;
    const tipo = tc && tc > 0 ? tc : this._tipoCambio();
    return this._moneda() === 'USD' ? seguro / tipo : seguro;
  }

  /**
   * Formatea un valor numérico según la moneda activa.
   *
   * @param valor Monto a formatear.
   * @param origen 'USD' si el dato viene en dólares (ej. FileMaker precio, analítica baseCalculo).
   *               'BOB' si el dato viene en bolivianos (ej. Venta CRM, sueldoBase, totalBob).
   * @param tc Tipo de cambio opcional (si no se pasa, usa el oficial 6.97).
   */
  formatear(valor: number | string, origen: 'USD' | 'BOB' = 'USD', tc?: number): string {
    const num = typeof valor === 'string' ? parseFloat(valor) : valor;
    const seguro = isNaN(num) ? 0 : num;
    const tipo = tc && tc > 0 ? tc : this._tipoCambio();

    if (origen === 'USD') {
      if (this._moneda() === 'BOB') {
        const enBob = seguro * tipo;
        return `Bs ${this.formatearNumero(enBob)}`;
      }
      return `$us ${this.formatearNumero(seguro)}`;
    } else {
      if (this._moneda() === 'USD') {
        const enUsd = seguro / tipo;
        return `$us ${this.formatearNumero(enUsd)}`;
      }
      return `Bs ${this.formatearNumero(seguro)}`;
    }
  }

  private formatearNumero(num: number): string {
    return num.toLocaleString('es-BO', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  private cargarMonedaInicial(): MonedaVisualizacion {
    try {
      const guardada = localStorage.getItem(CLAVE_STORAGE);
      if (guardada === 'USD' || guardada === 'BOB') {
        return guardada;
      }
    } catch {
      // Fallback
    }
    // Por defecto Bolivianos (moneda nacional comercial)
    return 'BOB';
  }
}
