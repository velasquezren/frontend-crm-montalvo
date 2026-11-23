# 8b. El equipo de marketing: cobra sin vender

> Parte de la skill `crm-finanzas`: lee antes su [índice](../SKILL.md).

**No tiene rol propio y no debe tenerlo.** `Rol` (SUPER_ADMIN / ADMIN / AGENTE)
es acceso al CRM y su jerarquía es una línea; "marketing" no va en esa línea, es
otra cosa. Lo que describe a esta gente ya existe: `AreaVendedora.PUBLICIDAD`,
una fila más de la planilla. En el Excel están exactamente así — hoja
`GRAL COM`, filas 75-76 de diciembre 2025: comisión 0, bono 232,41 Bs, sueldo
3.462,50, total ganado 3.694,91. La misma forma que cualquier otra fila.

*(La planilla lo llama "EQUIPO DE PUBLICIDAD" en la hoja de bonos y "MARKETING"
en la consolidada. El enum conserva `PUBLICIDAD` —cambiarlo es una migración y
un `sync:tipos` a cambio de nada— y la interfaz lo muestra como "Marketing".)*

### El bug que esto destapó

`calcular()` descartaba a quien no tuviera ventas:

```ts
if (suyas.length === 0) continue;   // ← se llevaba por delante a marketing
```

Marketing **no vende nunca**: no tiene `vendedora_pk` ni una sola fila en el
export de FileMaker. Así que no llegaba a `resultados`, el filtro por área de
`aplicarBonos()` no encontraba a nadie, y el pote de publicidad se repartía
entre cero personas. **66,69 USD (464,83 Bs) de diciembre que la planilla real
paga y el sistema no** — sin lanzar, sin log, sin aparecer en ninguna alerta.

La regla correcta es "se liquida a quien puede cobrar algo este mes", y eso
incluye a quien cobra un bono que **no sale de sus propias ventas**:
`cobraSinVender()` = área PUBLICIDAD o tipo JEFA. La jefa está por lo mismo, no
por simetría: su bono también sale del pote del equipo, así que un mes sin
vender tampoco puede dejarla fuera. Una ejecutiva sin ventas sigue sin entrar —
una fila entera en cero sería ruido en la planilla que se firma.

### El pote se paga DOS veces, no se parte en dos

`repartirPote()` (puro, en `reglas-calculo.ts`): el pote va **íntegro** a la
jefatura y **otro tanto igual** repartido entre marketing. Un lado vacío no le
regala su parte al otro — son dos pagos independientes que salen del mismo
número. Las que lo generan cobran cero por este concepto.

### Marketing nunca se autocrea: hay que darla de alta

El alta automática ocurre al importar, leyendo el `vendedora_pk` de cada fila.
Sin filas no hay alta, y `EQUIPO_OFICIAL` tampoco sirve — solo se aplica a
códigos **detectados en el Excel**. Por eso existe `POST /vendedoras`
(SUPER_ADMIN) y el botón «Añadir persona» de Configuración.

Y como "no hay nadie a quien pagarle" es un estado silencioso, hay dos señales:
un `warn` en el cálculo cuando el pote queda sin repartir, y un aviso en el
directorio de vendedoras cuando no hay nadie en el área.

### En el Excel va en un bloque aparte

La hoja "Liquidación" se parte en dos: la tabla de ventas con su
`TOTAL EQUIPO DE VENTAS`, el bloque `EQUIPO DE MARKETING` debajo con su
`TOTAL MARKETING`, y un `TOTAL GENERAL A PAGAR` que junta los dos. No es
estética: la fila de marketing tiene 14 de 20 columnas en cero y mezclada entre
las ejecutivas obliga a leer fila por fila para entender por qué. La planilla de
administración ya lo resuelve así.

Tres detalles que no son adorno:

- **Mismas columnas, no una tabla suelta**: así "Bonos", "Sueldo base" y
  "A PAGAR" siguen alineadas de arriba abajo para toda la planilla.
- **Las columnas que no aplican van VACÍAS, no en `$ 0,00`** — en las filas y
  también en el subtotal. Un cero dice "vendió y no llegó"; el hueco dice "esto
  no le corresponde", que es lo cierto.
- **Cada pie suma las filas que tiene encima** (`sumarFilas()`), no
  `consolidado.totales`: ese número es del periodo entero y con la hoja partida
  serviría para el total general y para ninguno de los dos subtotales.

Marketing tampoco entra en la hoja "Tipo A (RA)" (no tiene ingreso de ese cubo)
ni recibe hoja individual (saldría vacía). Y si no hay nadie en marketing, la
hoja no cambia de vocabulario: el pie se sigue llamando `TOTALES`.

De paso se arregló que la fila de totales dejaba en blanco la columna "Sueldo
base" mientras "A PAGAR" sí incluía los sueldos: el pie de la única hoja que se
firma no cuadraba a ojo.

Pruebas: `marketing-bono.spec.ts`, que reconstruye el pote de diciembre desde
los excedentes reales y fija los 33,35 USD por persona, y el bloque `equipo de
marketing` de `exportacion-ocultas.spec.ts`, que lo comprueba sobre el .xlsx
generado de verdad.
