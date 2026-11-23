# 4b. Las cachés del módulo, y quién tiene que tirarlas

> Parte de la skill `crm-finanzas`: lee antes su [índice](../SKILL.md).

Tres cachés en memoria sirven este módulo, todas con
`common/cache/cache-memoria.ts` y todas invisibles cuando fallan — sirven un
número plausible y viejo, no un error:

| Caché | Clave | TTL | Qué describe |
|---|---|---|---|
| `AnaliticaComisionesService` | `periodoId` | 60 s | los diez agregados de la pestaña Analítica |
| `ResumenAnualService` | `año_vendedora` | 60 s | la matriz de doce meses |
| `CatalogoClinicoService` | única | 1 h | los servicios que sugiere el modal de ventas |

**La analítica no es solo una pestaña: es también el Excel.**
`exportacion-comisiones.service.ts` llama a `analitica.analitica(periodoId)` —el
método CACHEADO— para armar las hojas «Resumen», «Distribución» y «Rankings».
Lo que esté viejo en la pestaña está viejo en el archivo que se firma.

### El fallo que esto cierra (2026-09-10)

`invalidar()` de la analítica **solo lo llamaba `calcular()`**. No lo llamaban
importar, ajustar una fila, reclasificar con una regla nueva, borrar el periodo
ni ninguna transición de estado. Durante 60 s:

- Reimportar el mes dejaba la Analítica describiendo el archivo anterior.
- Y el caso feo: `ajustarVenta()` llama a `invalidarCalculo()`, que **borra los
  `ResultadoComision` del periodo**. Excluir una fila y descargar el Excel en
  ese minuto producía un archivo cuyo «Resumen» declaraba una liquidación —
  vendedoras liquidadas, comisión total en $us y Bs— que ya no existía en la
  base.

**La corrección es un solo punto**, `invalidarCachesDelPeriodo(periodoId)` en
`PlanillaComisionesService`, y las nueve mutaciones que tocan un periodo pasan
por ahí. Escribir `analitica.invalidar(id)` suelto al lado de cada
`resumenAnual.invalidar()` es exactamente cómo se llega a la décima que se
olvida — el mismo error que ya documentan las cinco comprobaciones de
`esEditable()` (§8).

Dos detalles que no son casualidad:

- **La clave es el PERIODO, nunca la fila que se tocó.** En `ajustarVenta` el
  parámetro `id` es el de la *venta*: invalidar con él no lanza, no deja log y
  no borra nada — la caché se sigue sirviendo vieja igual que antes. Lo fija
  `ajustar-venta.spec.ts`.
- **Las mutaciones de vendedora NO la tiran.** `crearVendedora` y
  `actualizarVendedora` solo invalidan la anual: la analítica agrega
  `VentaImportada` y `ResultadoComision` sin mirar a `VendedoraComision` —ni
  siquiera para filtrar las ocultas—, así que tirarla ahí sería recalcular diez
  agregados para el mismo resultado.
