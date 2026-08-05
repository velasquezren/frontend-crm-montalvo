import { HttpEvent, HttpInterceptorFn, HttpResponse } from '@angular/common/http';
import { of, tap } from 'rxjs';

/**
 * Caché en memoria para los datos de REFERENCIA.
 *
 * Por qué existe: medido contra producción, el servidor resuelve sus consultas
 * en 6-27 ms, pero cada petición cuesta ~190 ms de ida y vuelta desde Bolivia
 * (y ~385 ms más si hay que abrir conexión). O sea que en una navegación el 97%
 * del tiempo es red. Optimizar SQL no movería la aguja; no repetir la petición,
 * sí.
 *
 * Y hay peticiones que se repiten sin motivo: `/planilla-comisiones/periodos`
 * —los meses ya importados— lo piden tres servicios distintos, así que cada
 * salto a Servicios, Planilla o Reportes lo volvía a traer.
 *
 * **Solo entran aquí endpoints de datos que cambian cuando alguien importa o
 * configura algo, nunca los que reflejan la operación del día.** Nada de
 * clientes, leads, ventas, conversaciones ni KPIs: ahí una respuesta vieja sería
 * un dato equivocado en pantalla, y eso vale más que 190 ms.
 */
const REFERENCIA = [
  '/planilla-comisiones/periodos',
  '/planilla-comisiones/configuracion',
  '/planilla-comisiones/vendedoras',
  /* Agregado de las 15.000+ fichas: solo se mueve al importar pacientes. */
  '/servicios/demografia',
];

/** Vida de una entrada. Corta a propósito: ante la duda, que pese la frescura. */
const TTL_MS = 60_000;

const cache = new Map<string, { cuerpo: unknown; expira: number }>();

/** Cualquier escritura puede invalidar cualquier lectura: se vacía entera. */
function invalidar(): void {
  cache.clear();
}

/**
 * Se llama al cerrar sesión. En la clínica varias agentes usan el mismo equipo:
 * sin esto, lo que cargó la primera seguiría en memoria para la siguiente
 * durante el minuto de vida de la caché.
 */
export function limpiarCacheApi(): void {
  cache.clear();
}

export const cacheInterceptor: HttpInterceptorFn = (req, next) => {
  if (req.method !== 'GET') {
    /* Se vacía ANTES de que salga la escritura: si se hiciera al responder, una
       lectura disparada mientras tanto repoblaría la caché con lo viejo. */
    invalidar();
    return next(req);
  }

  if (!REFERENCIA.some(ruta => req.url.includes(ruta))) {
    return next(req);
  }

  /* La clave incluye los parámetros: `?limite=100` y `?limite=10` no son la
     misma respuesta. */
  const clave = req.urlWithParams;
  const guardado = cache.get(clave);

  if (guardado && Date.now() < guardado.expira) {
    return of(new HttpResponse({ body: guardado.cuerpo, status: 200 }) as HttpEvent<unknown>);
  }

  return next(req).pipe(
    tap(evento => {
      if (evento instanceof HttpResponse && evento.status === 200) {
        cache.set(clave, { cuerpo: evento.body, expira: Date.now() + TTL_MS });
      }
    }),
  );
};
