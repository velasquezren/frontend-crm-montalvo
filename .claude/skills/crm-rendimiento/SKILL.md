---
name: crm-rendimiento
description: Método obligatorio para cualquier trabajo de rendimiento en este CRM — cómo medir sin navegador, qué mueve la aguja según las mediciones reales del proyecto y qué decisiones ya tomadas no se deshacen. Úsalo SIEMPRE que el pedido mencione velocidad, lentitud, optimizar, "que vaya más rápido", fluidez, animaciones, caché, bundle, lazy loading, polling o tiempo de carga; antes de escribir un commit con prefijo `perf`; y antes de tocar el interceptor de caché, `provideAppInitializer` o cualquier `setInterval`.
---

# Rendimiento

Este skill no lista técnicas de optimización: lista **el método**. Las técnicas se
eligen después de medir, y en este proyecto casi todas las que suenan bien no
aplican.

## Regla de oro

**Un cambio de rendimiento sin una medición antes y otra después no se commitea.**

No "se siente más rápido". No "esto debería ser más fluido". Un número antes, un
número después, y el número en el cuerpo del commit. Si no se puede medir, el
cambio no es de rendimiento — es de estilo, y va con otro prefijo.

### La cicatriz que hace falta esta regla

El 2026-08-10, entre las 20:50 y las 20:57, se commitearon tres cambios seguidos
sobre `fab-menu.component.ts`:

| Commit | Título | Diff |
|---|---|---|
| `83e2c1e` | `perf(fab)`: aceleración GPU, aislamiento de layout, 60fps | +60 −55 |
| `033a5c6` | `perf(fab)`: eliminar retardos y animaciones para despliegue a 0ms | +17 −147 |
| `27e0636` | `perf(pwa)`: banner PWA y renderizado instantáneo | +157 −27 |

El archivo terminó con **el mismo hash de blob** con el que empezó
(`602457c9bb0a47fefd311a9aebcf8af32bcc3fb9` antes y después). Diff neto de los tres
commits sobre ese archivo: **cero**. Siete minutos de trabajo, tres commits en el
historial, y el código exactamente donde estaba.

Ninguno de los tres llevaba un número. "0ms", "60fps" e "instantáneo" son
afirmaciones, no mediciones: nadie podía saber si el segundo commit mejoraba o
empeoraba lo que hizo el primero, así que el tercero deshizo el segundo sin querer.
**Sin medición no hay dirección**, y sin dirección optimizar es caminar en círculos
mientras el historial se llena de ruido.

## Los números de este proyecto

Medidos contra producción desde Bolivia el 2026-08-05:

| | |
|---|---|
| Consulta resuelta en el servidor | **6-27 ms** |
| Ida y vuelta con la conexión ya abierta | **~190 ms** |
| Handshake TLS (primera petición) | **~385 ms** |

**El 97% del tiempo de una navegación es red.** Esta sola cifra decide casi todo lo
que sigue: si un cambio no reduce el número de peticiones, su tamaño o el momento en
que se hacen, no va a notarse aunque el perfilador diga que algo mejoró.

## Cómo se mide aquí (sin navegador)

Este proyecto **prohíbe usar el navegador** (ver `crm-feature-page` y
`crm-design-system`). No es un obstáculo: las dos métricas que importan se miden
mejor desde la terminal, y además son deterministas —dos personas obtienen el mismo
número, cosa que un Lighthouse manual no garantiza—.

### Frontend: el reporte de `ng build` es la medición

```bash
npm run build 2>&1 | grep -A2 "Initial total"
```

Anota el **Initial total** (bruto y transferido) antes de tocar nada y después. Esa
cifra es lo que un agente descarga antes de ver la primera pantalla, y en una red de
190 ms de latencia es lo que más pesa.

Referencia del 2026-08-11: **436.79 kB brutos / 113.26 kB transferidos**.

Para un cambio que afecta a una vista concreta, compara además el tamaño de su
*lazy chunk* en la misma tabla.

### Backend: `curl -w`, no impresiones

```bash
curl -s -o /dev/null -w 'conexión %{time_connect}s · TTFB %{time_starttransfer}s · total %{time_total}s\n' \
  -H "Authorization: Bearer $TOKEN" 'http://localhost:3000/kpis/resumen'
```

Córrelo tres veces y quédate con la mediana. Si sospechas de una consulta concreta,
`log: ['query']` en el `PrismaClient` te da el SQL con su tiempo — pero recuerda el
6-27 ms de arriba antes de convencerte de que la lenta es ella.

## Qué mueve la aguja, en orden

1. **No hacer la petición.** Cachear datos de referencia, derivar en memoria lo que
   ya tienes cargado, no pedir el detalle de algo que ya está en el listado. Ahorra
   190 ms de golpe.
2. **No bloquear el primer pintado.** Nada espera a la red antes de que la app
   aparezca.
3. **Bajar el bundle inicial.** Lazy loading por ruta, `@defer (on viewport)` para
   lo que está bajo el pliegue.
4. **Bajar el tamaño de la respuesta.** `select` en Prisma en vez de traer la fila
   entera; paginar siempre.
5. **Todo lo demás.** Incluye animaciones, `will-change`, `contain`, memoización de
   `computed()` y micro-optimización de SQL. En este proyecto, ruido.

Si estás en el punto 5 sin haber comprobado los cuatro anteriores, estás
optimizando lo que es fácil de tocar, no lo que es lento.

## Decisiones ya tomadas: no las deshagas

Las tres están medidas y documentadas en el código. Si vas a cambiarlas, trae un
número que las contradiga.

**1. `provideAppInitializer` no espera a la red** (`app.config.ts`). Devolver la
promesa de `sincronizarRol()` dejaba la pantalla en blanco ~575 ms en cada carga y
en cada F5. Se dispara con `void` a propósito. El medio segundo de menú de más no
es un agujero: el backend responde 403 igualmente.

**2. Solo los datos de REFERENCIA se cachean** (`core/api/cache.interceptor.ts`),
60 s. Entran los que cambian al importar o configurar algo. **Nunca** clientes,
leads, ventas, conversaciones ni KPIs: una respuesta vieja de esos es un dato
equivocado en pantalla, y eso vale más que 190 ms.

Los cuatro que entran hoy, y la lista es exhaustiva:

```
/planilla-comisiones/periodos
/planilla-comisiones/configuracion
/planilla-comisiones/vendedoras
/servicios/demografia
```

> Antes de añadir un endpoint a esa lista, pregúntate qué se ve si llega un minuto
> tarde. Si la respuesta incomoda, no va. El validador exige que la lista del código
> y la de este archivo coincidan, justamente para que nadie amplíe la caché sin
> pasar por esa pregunta.

**3. El polling de respaldo es de 60 s, no de 15.** El mecanismo principal es
`RealtimeService` por WebSocket; el intervalo es una red de seguridad por si el
socket se cae. Un `setInterval` corto recargando "por si acaso" es exactamente el
patrón que el socket vino a sustituir.

## Rendimiento de mentira

Cosas que parecen optimización y no lo son. Todas aparecieron ya en este repo:

- **Poner `will-change`, `translateZ(0)` o `contain` "para que vaya a 60fps"** sin
  haber observado una caída de frames. Suele empeorar: cada capa promovida es
  memoria de GPU.
- **Quitar animaciones para llegar a "0 ms".** Una transición de 200 ms no es
  latencia, es la señal de que algo respondió. Quitarla no hace la app más rápida,
  la hace más brusca. Si el objetivo real es que *responda antes*, mide qué la
  retrasa.
- **Micro-optimizar una consulta de Prisma** antes de comprobar que es la lenta.
  Con 6-27 ms de servidor, casi nunca lo es.
- **Cachear algo que cambia.** Ganar 190 ms mostrando un dato falso no es una
  mejora, es un bug con buena prensa.
- **`OnPush` y `track` como "optimización".** No lo son: son obligatorios en este
  proyecto (ver `crm-feature-page`). Añadirlos donde faltaban es corregir una
  omisión, y el commit va como `fix`, no como `perf`.

## Antes de dar por terminado

- Tienes el número de antes y el de después, y están en el cuerpo del commit.
- `npm run build` pasa (y su `Initial total` no subió sin que lo justifiques).
- No añadiste a la caché ningún endpoint que refleje la operación del día.
- No metiste un `setInterval` por debajo de 60 s.
- El prefijo del commit dice la verdad: `perf` solo si hay medición; si no, `fix`,
  `refactor` o `style`.

## Mantenimiento

`npm run check:skills` contrasta este archivo con el código: que la lista de
endpoints cacheados coincida con `cache.interceptor.ts`, que
`provideAppInitializer` siga sin devolver la promesa, y que ningún `setInterval`
baje de 60 s. Va encadenado a `npm run build`.

Verifica **datos, no criterio**: las cifras medidas y el porqué de cada decisión se
actualizan a mano. Cuando el validador te contradiga, corrige el skill — el código
es la verdad.
