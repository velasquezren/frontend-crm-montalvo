import { defineConfig } from 'vitest/config';

/**
 * Aislamiento entre ficheros de prueba.
 *
 * El runner de Angular arranca Vitest con `isolate: false` —lo fija
 * `@angular/build/src/builders/unit-test/runners/vitest/plugins.js`, «para
 * alinearse con la experiencia de Karma/Jasmine»—, así que los ficheros que
 * caen en el mismo worker **comparten el registro de módulos**. Con eso, un
 * `vi.mock()` de nivel de módulo deja de ser una garantía: vale solo si tu
 * fichero es el primero de su worker en cargar ese módulo.
 *
 * Lo que costó (2026-09-17): `realtime.service.ts` es el único sitio que
 * importa `socket.io-client`, y varios specs lo importan a él para usarlo como
 * token de DI. Cuando uno de esos corría antes en el mismo worker, el módulo
 * quedaba cacheado con el `io` REAL dentro y el `vi.mock('socket.io-client')`
 * de `realtime.service.spec.ts` llegaba tarde: `fabrica.io` no se llamaba
 * nunca, el servicio abría un socket de verdad y sus siete casos caían en
 * bloque. Medido con la suite completa: 4 corridas rojas de 14 (~29 %), y el
 * campo privado `socket` con las claves de un Socket real
 * (`connected`, `receiveBuffer`, `_queue`, `acks`…).
 *
 * En aislamiento no fallaba nunca, ni en parejas: hacían falta bastantes
 * ficheros para que el planificador los empaquetara juntos, y el orden lo
 * decide Vitest con la caché de duraciones de la corrida anterior. De ahí que
 * pareciera flakiness del código de R2.2 cuando el código no tenía nada que
 * ver: los dos specs nuevos solo cambiaban el reparto.
 *
 * `isolate: true` es lo que Vitest trae por defecto y lo que hace que un
 * `vi.mock` signifique lo que aparenta. El precio son ~25 s más de suite
 * (~10 s → ~35 s); la alternativa era una suite que miente una de cada tres
 * veces, que es peor que una lenta.
 */
export default defineConfig({
  test: {
    isolate: true,
  },
});
