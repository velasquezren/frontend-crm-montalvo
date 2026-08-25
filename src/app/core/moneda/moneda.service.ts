import { Injectable, computed, inject, signal } from '@angular/core';

import { ApiService } from '../api/api.service';

export type MonedaVisualizacion = 'BOB' | 'USD';

const CLAVE_STORAGE = 'crm_moneda_visualizacion';

/**
 * Solo se usa mientras el backend no ha contestado, o si no contesta.
 *
 * **No es "el tipo de cambio del sistema".** Ese vive en el backend, en la
 * serie histórica de `TipoCambioDiario` (módulo `tipo-cambio`), y lo trae
 * `cargarTipoCambio()`. Tener aquí un número fijo como única fuente era el bug
 * original: quedó escrito 6,97 mientras el oficial subía a 11,54 y nada en el
 * frontend se enteraba, porque no había ninguna otra fuente contra la cual
 * contrastarlo.
 */
export const TIPO_CAMBIO_DE_RESPALDO = 6.97;

/**
 * El ÚNICO formateador de números del CRM, construido una sola vez.
 *
 * `Number.prototype.toLocaleString` construye un `Intl.NumberFormat` nuevo en
 * cada llamada, y ese constructor es la parte cara: ~15 µs contra ~0,3 µs de
 * formatear con uno ya hecho. Con 77 celdas de dinero en pantalla y un pipe
 * impuro, esa diferencia se paga en cada ciclo de detección de cambios.
 */
const FORMATO = new Intl.NumberFormat('es-BO', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Un número con separador de miles y dos decimales, sin símbolo de moneda. */
export function formatearNumero(valor: number): string {
  return FORMATO.format(valor);
}

/** Lo que responde `GET /tipo-cambio/vigente`. */
interface TipoCambioVigente {
  tipoCambio: number;
  fecha: string | null;
  fuente: 'AUTOMATICO' | 'MANUAL' | 'RESPALDO';
}

/**
 * Servicio central para el selector de moneda (Bs / $us).
 * Permite alternar visualmente entre Bolivianos y Dólares en todo el CRM
 * sin alterar la base de datos ni las fórmulas de comisiones.
 */
@Injectable({ providedIn: 'root' })
export class MonedaService {
  private readonly api = inject(ApiService);

  private readonly _moneda = signal<MonedaVisualizacion>(this.cargarMonedaInicial());
  private readonly _tipoCambio = signal<number>(TIPO_CAMBIO_DE_RESPALDO);
  private readonly _tipoCambioGlobal = signal<number>(TIPO_CAMBIO_DE_RESPALDO);
  private readonly _fuente = signal<'backend' | 'respaldo'>('respaldo');

  /** Moneda activa actualmente: 'BOB' (Bolivianos) o 'USD' (Dólares). */
  readonly moneda = this._moneda.asReadonly();
  /** Tipo de cambio con el que se convierte ahora mismo. */
  readonly tipoCambio = this._tipoCambio.asReadonly();
  /** 'respaldo' mientras el backend no haya contestado. Para poder avisarlo. */
  readonly fuente = this._fuente.asReadonly();

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
   * Trae del backend el tipo de cambio vigente: el más reciente de la serie
   * histórica `TipoCambioDiario` (automático o corregido a mano por un ADMIN).
   *
   * Se llama UNA vez al arrancar y nunca más — volver a pedirlo costaría 190 ms
   * de red por nada, y el valor del día no cambia mientras la sesión está
   * abierta. Si falla, se queda el de respaldo y la aplicación sigue: un
   * selector de moneda no puede tumbar una pantalla.
   */
  async cargarTipoCambio(): Promise<void> {
    try {
      const vigente = await this.api.get<TipoCambioVigente>('/tipo-cambio/vigente');
      if (!(vigente?.tipoCambio > 0)) return;

      this._tipoCambioGlobal.set(vigente.tipoCambio);
      this._fuente.set(vigente.fuente === 'RESPALDO' ? 'respaldo' : 'backend');
      this._tipoCambio.set(vigente.tipoCambio);
    } catch {
      /* Sin sesión todavía, o backend caído: se sigue con el de respaldo. */
    }
  }

  /**
   * Fija el TC de un periodo concreto mientras se está viendo ese periodo.
   *
   * La planilla muestra cifras que el backend liquidó con el TC de SU mes, así
   * que convertirlas a dólares con el TC de otro mes daría un número que no
   * cuadra con la liquidación. Al salir de esa pantalla se vuelve al global con
   * `restaurarTipoCambioGlobal()`.
   */
  setTipoCambio(tc: number): void {
    if (tc > 0 && !isNaN(tc)) {
      this._tipoCambio.set(tc);
    }
  }

  /** Devuelve la conversión al tipo de cambio vigente del backend. */
  restaurarTipoCambioGlobal(): void {
    this._tipoCambio.set(this._tipoCambioGlobal());
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

  /**
   * Atajo para los importes que ya vienen en bolivianos, que son casi todos los
   * del CRM propio (ventas, comisiones, sueldos). Existe para que las tarjetas
   * de KPI puedan ser reactivas sin repetir `'BOB'` en cada llamada.
   */
  formatearBob(valor: number | string): string {
    return this.formatear(valor, 'BOB');
  }

  private formatearNumero(num: number): string {
    return FORMATO.format(num);
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
