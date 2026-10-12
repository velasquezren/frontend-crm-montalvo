/**
 * El respaldo por temporizador de lo que llega por socket: una sola regla para
 * todas las vistas que lo necesitan (el inbox y la campana de actividades).
 */

/** Latido del respaldo. Un minuto es lo que el navegador respeta de fondo. */
export const INTERVALO_RESPALDO_MS = 60_000;

/** Con el socket sano solo se pregunta cada 5 latidos, por si quedó zombi. */
export const TICKS_CON_SOCKET = 5;

/**
 * Si este latido del respaldo debe preguntar al servidor.
 *
 * Es la regla que decide cuánta red gastan las vistas que se quedan abiertas
 * todo el día. En el inbox, 219 de 437 peticiones no traían nada nuevo; en la
 * campana, `/actividades/resumen` era el endpoint más pedido del CRM (9.023 en
 * tres días, medido el 12/10/2026) porque preguntaba cada minuto con el socket
 * sano.
 *
 * - Pestaña oculta: nunca. Nadie está mirando, y al volver se refresca una vez.
 * - Socket conectado: uno de cada `TICKS_CON_SOCKET`, solo por si quedó zombi
 *   (y para lo que cambia con el reloj, como una actividad que vence).
 * - Socket caído: cada latido, que es justo cuando el respaldo hace falta.
 */
export function debeRefrescar(ticks: number, conectado: boolean, oculto: boolean): boolean {
  if (oculto) return false;
  return ticks >= (conectado ? TICKS_CON_SOCKET : 1);
}
