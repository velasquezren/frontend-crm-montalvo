import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { formatearNumero, MonedaService, MonedaVisualizacion } from '../../../core/moneda/moneda.service';

/**
 * Selector de moneda de visualización (Bs / $us).
 *
 * Usa `.crm-segmento` del sistema de diseño, que es la forma declarada para un
 * control segmentado —el skill `crm-design-system` cita este control por su
 * nombre—. Antes se armaba a mano con utilidades: carril con `shadow-subtle`
 * MÁS opción activa con relleno sólido y otra `shadow-subtle`, dos sombras
 * apiladas que le daban un relieve que ningún otro control de la app tiene.
 * El segmentado del sistema levanta la opción activa sobre el surco con fondo
 * blanco y una sola sombra, y es el mismo que ya usan Actividades y Agentes.
 *
 * Lleva además `.crm-segmento-compacto`: vive en la topbar, junto a la campana
 * y el avatar en 64px de alto, y con el cuerpo del segmentado normal era el
 * elemento más pesado de la barra sin ser el más importante.
 *
 * Sin `size` ni `mostrarDetalle`: el tamaño lo fijan las clases y nadie pasaba
 * nunca el detalle. Eran entradas sin un solo consumidor.
 */
@Component({
  selector: 'app-moneda-toggle',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="crm-segmento crm-segmento-compacto" role="group" aria-label="Selector de moneda">
      <button
        type="button"
        (click)="cambiarMoneda('BOB')"
        class="crm-segmento-opcion"
        [class.crm-segmento-opcion-activo]="monedaService.esBob()"
        [attr.aria-pressed]="monedaService.esBob()"
        title="Visualizar montos en Bolivianos (Bs)">
        Bs
      </button>
      <button
        type="button"
        (click)="cambiarMoneda('USD')"
        class="crm-segmento-opcion"
        [class.crm-segmento-opcion-activo]="monedaService.esUsd()"
        [attr.aria-pressed]="monedaService.esUsd()"
        [title]="tituloUsd()">
        $us
      </button>
    </div>
  `,
})
export class MonedaToggleComponent {
  protected readonly monedaService = inject(MonedaService);

  /**
   * Con qué se convierte, en el tooltip del botón de dólares.
   *
   * El toggle solo decía "Visualizar montos en Dólares", y con qué tasa era
   * invisible — justo el dato que hace falta para no confundir un monto
   * convertido al valor pactado de la clínica con uno convertido al oficial
   * del día, que en agosto de 2026 se diferencian en un 71 %.
   */
  protected readonly tituloUsd = computed(() => {
    const tc = formatearNumero(this.monedaService.tipoCambio());
    return this.monedaService.esTipoCambioFijo()
      ? `Visualizar montos en Dólares ($us) — convertido a Bs ${tc} (tipo de cambio fijo de la clínica)`
      : `Visualizar montos en Dólares ($us) — convertido a Bs ${tc}`;
  });

  protected cambiarMoneda(moneda: MonedaVisualizacion): void {
    this.monedaService.setMoneda(moneda);
  }
}
