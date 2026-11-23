# Rendimiento: el cuello de botella es la RED, no las consultas

> Parte de la skill `crm-feature-page`: lee antes su [índice](../SKILL.md).

Medido contra producción el 2026-08-05, desde Bolivia:

| | |
|---|---|
| Consulta en el servidor | **6-27 ms** |
| Ida y vuelta con conexión abierta | **~190 ms** |
| Handshake TLS (primera petición) | **~385 ms** |

O sea que en una navegación **el 97% del tiempo es red**. Antes de optimizar una
consulta de Prisma, comprueba que sea ella la lenta: casi nunca lo es. Lo que se
nota es **no hacer la petición**.

De ahí dos decisiones que ya están tomadas y conviene no deshacer:

**1. `provideAppInitializer` no espera a la red.** La sincronización de rol se
dispara sin `return` (`app.config.ts`): devolver la promesa dejaba la pantalla en
blanco ~575 ms en cada carga y en cada F5, porque Angular no arranca hasta que el
initializer resuelve. Ahora pinta de inmediato y la comprobación termina después;
si el rol cambió, cierra la sesión igual. El medio segundo de menú de más no es
un agujero: el backend responde 403 igualmente.

**2. Los datos de REFERENCIA se cachean 60 s** en `core/api/cache.interceptor.ts`.
`/planilla-comisiones/periodos` lo pedían tres servicios distintos, así que cada
salto a Servicios, Planilla o Reportes lo volvía a traer.

**Solo entra ahí lo que cambia al importar o configurar algo** (periodos,
configuración, vendedoras, demografía). **Nunca** clientes, leads, ventas,
conversaciones ni KPIs: una respuesta vieja de esos es un dato equivocado en
pantalla, y eso vale más que 190 ms. Cualquier escritura (POST/PATCH/PUT/DELETE)
vacía la caché entera antes de salir, y `logout()` también — en la clínica varias
agentes comparten el mismo equipo.

Si añades un endpoint a esa lista, pregúntate qué se ve si llega un minuto tarde.
Si la respuesta incomoda, no va.

**La coincidencia es por ruta EXACTA, no por prefijo** (`esDeReferencia()`).
Hasta el 2026-08-28 era `url.includes(ruta)`, e `includes` no distingue una
colección de sus hijos: `/planilla-comisiones/periodos` casaba también con
`/periodos/:id/ventas`, `/alertas`, `/reporte/consolidado`, `/revision` y hasta
con el `/exportar` que devuelve el Excel. Todos ellos son operación del día —lo
que esta misma lista declara que NO entra— y se servían hasta un minuto tarde.

Cuesta verlo porque cualquier escritura vacía la caché entera: trabajando solo
casi nunca sale nada viejo. **Se nota cuando el cambio lo hace otra persona**,
que es la situación normal en la clínica. El caso real: dos SUPER_ADMIN
revisando el mismo mes, uno aprueba y el otro sigue viendo "falta su firma" con
el botón de aprobar puesto sobre un mes ya cerrado. Lo fija
`cache.interceptor.spec.ts`.
