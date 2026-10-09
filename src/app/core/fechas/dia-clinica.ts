import { DestroyRef, inject, Signal, signal } from '@angular/core';

import { fechaCivilClinica } from './zona-clinica';

/**
 * El día de la clínica («2026-10-09») como señal que cambia sola a la
 * medianoche de La Paz.
 *
 * Para los `computed` que parten el calendario («Hoy», «Vencidas»): uno que lee
 * `new Date()` se calcula una vez y no vuelve a hacerlo, así que una pantalla
 * abierta pasada la medianoche seguía filtrando el día anterior. Esta señal
 * mira la hora cada minuto pero solo AVISA cuando cambia el día (es un string:
 * mismo valor, ningún aviso), así que lo que dependa de ella se recalcula una
 * vez al día y no en cada minuto.
 *
 * Se llama en un contexto de inyección (un campo de un componente): el
 * temporizador muere con él.
 */
export function diaClinicaVivo(intervaloMs = 60_000): Signal<string> {
  const dia = signal(fechaCivilClinica(new Date()));
  const id = setInterval(() => dia.set(fechaCivilClinica(new Date())), intervaloMs);
  inject(DestroyRef).onDestroy(() => clearInterval(id));
  return dia.asReadonly();
}
