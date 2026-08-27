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
sobre el componente de acciones rápidas flotantes (FAB):

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

### Auditoría de base de datos del 2026-08-11

Se midió con `EXPLAIN ANALYZE` contra producción para descartar N+1 y consultas sin
índice. **No se encontró nada que arreglar**, y conviene no repetir el trabajo:

| Consulta | Plan | Tiempo |
|---|---|---|
| Búsqueda de paciente, término común | Index Scan en `updatedAt` | 2,2 ms |
| Búsqueda de paciente, **sin coincidencias** (peor caso) | BitmapOr sobre los 3 GIN trgm | 4,6 ms |
| Listado de leads filtrado por estado | Index Scan en `createdAt` | 0,2 ms |
| Agregado `GROUP BY origen, estado` sobre 15.398 leads | Index **Only** Scan | 5,8 ms |

Tamaños reales: `Cliente` 15.394 · `Lead` 15.398 · `VentaImportada` 1.287 ·
**`Mensaje` 401 · `Conversacion` 102**.

Dos conclusiones que ahorran tiempo:

1. **Solo `Cliente` y `Lead` son grandes.** Optimizar consultas de conversaciones o
   mensajes es optimizar sobre cientos de filas: no hay nada que ganar ahí por mucho
   que el módulo sea el más complejo del proyecto.

   > **Matiz — la distinción que hace útil esta conclusión (2026-08-27).**
   > Es cierto para las *consultas*: con 325 conversaciones y 2.186 mensajes no
   > hay nada que ganar con índices ni reescribiendo SQL. Lo que NO se sigue de
   > ahí es que el inbox no tuviera un problema de escala, porque tenía uno
   > grave y de otra naturaleza: `LIMITE_INBOX = 500` cortaba el listado y el
   > frontend filtraba **y buscaba** en memoria sobre ese corte, así que al
   > cruzarlo los chats viejos desaparecían del buscador en silencio. Medido el
   > 26-ago: +13,3 conversaciones/día sobre 325, tope el ~8 de septiembre.
   >
   > **El inbox no necesitaba optimización: necesitaba paginación real.** Son
   > cosas distintas y solo una aparece en un perfilador — un `take` fijo es
   > rapidísimo justamente porque no trae lo que falta. Arreglado el 27-ago
   > moviendo orden, pestañas, filtro por agente y búsqueda a Postgres; de paso
   > la carga inicial bajó de 277,7 kB a 27,8 kB y un mensaje nuevo pasó de
   > recargar 500 filas a pedir una (0,6 kB). Detalle en
   > `crm-backend-arquitectura` §7.
   >
   > La lección para la próxima vez que este archivo diga "no hay nada que
   > ganar": eso responde "¿es lento?", no "¿está todo lo que debería estar?".
2. **El `ILIKE '%texto%'` de la búsqueda de pacientes NO es un problema**, aunque lo
   parezca: los índices GIN trigram (`Cliente_nombre_trgm_idx` y sus dos hermanos) lo
   resuelven en 4,6 ms en el peor caso. Si alguna vez desaparece `pg_trgm` o esos
   índices, esa consulta pasa a Seq Scan sobre 15.000 filas — son ellos los que la
   sostienen, no la forma de la query.

También se verificó y está correcto: `Promise.all` en los 8 agregados del dashboard,
los nombres de agentes resueltos con un `findMany({ id: { in: [...] } })` + `Map` en
memoria (el patrón anti-N+1), cero `await` dentro de bucles en todo `src/`, y las
firmas de R2 son HMAC local (`aws4fetch`), no viajes de red.

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
Referencia del 2026-08-20: **442.43 kB brutos / 115.69 kB transferidos** (+5.6 kB
en nueve días de funcionalidad nueva; se anota para que la deriva se vea, no
porque haya que arreglarla).
Referencia del 2026-08-26: **441.96 kB brutos / 115.72 kB transferidos** — seis
días más de trabajo con el bundle inicial plano. La deriva no es monótona: lo
que se agrega dentro de una ruta *lazy* no toca esta cifra.

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

Los siete que entran hoy, y la lista es exhaustiva:

```
/planilla-comisiones/periodos
/planilla-comisiones/configuracion
/planilla-comisiones/vendedoras
/servicios/demografia
/servicios/dashboard
/servicios/pacientes
/servicios/medicos
```

> Antes de añadir un endpoint a esa lista, pregúntate qué se ve si llega un minuto
> tarde. Si la respuesta incomoda, no va. El validador exige que la lista del código
> y la de este archivo coincidan, justamente para que nadie amplíe la caché sin
> pasar por esa pregunta. Los endpoints de `/servicios/*` se alimentan del Excel
> importado y no cambian en vivo; cualquier mutación invalida la caché completa.

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
