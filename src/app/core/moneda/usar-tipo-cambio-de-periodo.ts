import { DestroyRef, effect, inject, Signal } from '@angular/core';

import { MonedaService } from './moneda.service';

/**
 * Fija el TC global al del periodo que se está liquidando, mientras la
 * pantalla que lo pide esté activa, y lo devuelve al vigente al destruirse.
 *
 * **Por qué existe esto y no vive cada uno en su pantalla.** Liquidación y
 * Desempeño de Agentes muestran cifras en bolivianos que el backend ya
 * convirtió con el TC de SU mes — pasarlas a dólares con el TC de otro
 * periodo (el de hoy, o el de la pestaña que se esté mirando en el hub de
 * Finanzas) daría un número que no cuadra con la liquidación que
 * administración tiene delante. `MonedaService.tipoCambio` es global y las
 * dos pantallas pueden estar montadas a la vez dentro del hub —ver
 * `finanzas.page.ts`—, así que sin el parámetro `activo` la que solo está
 * montada de fondo (sin mirarse) le pisaba el TC a la que sí se mira apenas
 * el cursor pasaba por su pestaña.
 *
 * Las dos pantallas repetían este mismo efecto y el mismo `ngOnDestroy` letra
 * por letra; quedó aquí una sola vez para que un tercer lugar que necesite lo
 * mismo no tenga que copiarlo de nuevo, y para que un ajuste (por ejemplo,
 * qué pasa si `tipoCambio` llega en 0) se corrija en un solo sitio.
 *
 * Se llama desde el `constructor()` del componente —`inject()` necesita ese
 * contexto—, nunca desde fuera de uno.
 */
export function usarTipoCambioDePeriodo(
  activo: Signal<boolean>,
  periodo: Signal<{ readonly tipoCambio: string } | null>,
): void {
  const monedaService = inject(MonedaService);

  effect(() => {
    if (!activo()) return;
    const tc = Number(periodo()?.tipoCambio);
    if (tc > 0) monedaService.setTipoCambio(tc);
  });

  inject(DestroyRef).onDestroy(() => monedaService.restaurarTipoCambioGlobal());
}
