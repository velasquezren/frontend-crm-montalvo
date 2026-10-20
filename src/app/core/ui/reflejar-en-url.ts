import { effect, inject, untracked } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

/** Un parámetro por clave; `null` lo saca de la URL (es el valor por defecto). */
export type ParametrosUrl = Readonly<Record<string, string | null>>;

/**
 * Escribe en la URL lo que una lista está mostrando (filtros, búsqueda), para
 * que F5, volver desde otra pantalla o pasar el enlace deje la misma lista.
 *
 * Solo escribe: la página lee el `snapshot` al crear sus signals, validando
 * cada valor. Leer también los cambios de la URL pisaría lo que se está
 * tecleando con lo que la URL tenía un instante antes.
 *
 * - `replaceUrl`: no apila historial; Atrás sale de la página, no deshace filtros.
 * - `merge`: los demás parámetros (`?nuevo=1`, `?id=`) no se tocan.
 * - Si la URL ya dice eso, no navega: abrir con filtros no reescribe nada.
 *
 * Se llama en contexto de inyección (campo o constructor). La búsqueda se pasa
 * ya con su pausa, nunca lo tecleado: sería una navegación por tecla.
 */
export function reflejarEnUrl(parametros: () => ParametrosUrl): void {
  const route = inject(ActivatedRoute);
  const router = inject(Router);
  effect(() => {
    const queryParams = parametros();
    untracked(() => {
      const actual = route.snapshot.queryParamMap;
      if (Object.entries(queryParams).every(([clave, valor]) => actual.get(clave) === valor)) return;
      void router.navigate([], { relativeTo: route, queryParams, queryParamsHandling: 'merge', replaceUrl: true });
    });
  });
}
