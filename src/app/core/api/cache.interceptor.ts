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
  '/servicios/dashboard',
  '/servicios/pacientes',
  '/servicios/medicos',
];

/**
 * Solo la ruta EXACTA, nunca lo que cuelga de ella.
 *
 * Antes esto era `req.url.includes(ruta)`, y `includes` no distingue una
 * colección de sus hijos: `/planilla-comisiones/periodos` casaba también con
 * `/periodos/:id/ventas`, `/periodos/:id/alertas`,
 * `/periodos/:id/reporte/consolidado` y hasta con el `/exportar` que devuelve
 * el Excel. Todos ellos son datos de la operación del día —justo lo que este
 * archivo declara que NO debe entrar— y se estaban sirviendo hasta un minuto
 * tarde.
 *
 * No saltaba a la vista porque cualquier escritura vacía la caché entera, así
 * que trabajando solo casi nunca se ve viejo. Se nota cuando el cambio lo hace
 * OTRA persona: dos SUPER_ADMIN revisando el mismo mes, uno aprueba y el otro
 * sigue viendo "falta su firma" durante un minuto, con el botón de aprobar
 * puesto sobre un mes que ya está cerrado.
 *
 * `URL` en vez de comparar cadenas para que los parámetros no se cuelen en la
 * comparación: `/periodos?limite=100` tiene que seguir cacheándose.
 */
export function esDeReferencia(url: string): boolean {
  const ruta = new URL(url, 'http://local').pathname;
  return REFERENCIA.some(referencia => ruta === referencia || ruta.endsWith(referencia));
}

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

  if (!esDeReferencia(req.url)) {
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
