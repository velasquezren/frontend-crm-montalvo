# 8e. El Excel NO va en streaming, aunque el código lo dijera

> Parte de la skill `crm-finanzas`: lee antes su [índice](../SKILL.md).

`exportacion-comisiones.service.ts` afirmaba que «un mes de 500 filas y uno de
50.000 cuestan lo mismo en RAM». Es al revés: `new Workbook()` construye el
libro entero en memoria y `libro.xlsx.write(salida)` solo vuelca lo ya
construido. El streaming de verdad en ExcelJS es `stream.xlsx.WorkbookWriter`, y
no se usa. El `LOTE_DETALLE` de 1.000 acota lo que se lee de PostgreSQL de una
vez, **no** lo que ocupa el libro.

Medido (Node 22, 21 hojas como las del export real):

| filas de detalle | tiempo | heap tras construir | RSS al terminar |
|---|---|---|---|
| 500 (un mes real) | 0,27 s | +5 MB | 116 MB |
| 2.000 | 0,64 s | +19 MB | 164 MB |
| 10.000 | 2,7 s | +90 MB | **440 MB** |
| 50.000 | 13,4 s | +452 MB | **1,96 GB** |

`crm_backend.service` corre con `MemoryMax=400M`: a 10.000 filas systemd mata el
proceso **durante la descarga**, llevándose por delante a quien estuviera usando
el CRM. Hoy no es un problema —un mes ronda las 450-500 filas y suma ~450 al
mes—, pero el margen es de años, no infinito. **El día que una exportación tarde
varios segundos, el arreglo es `WorkbookWriter`, no subir el `MemoryMax`.**

### Las hojas por vendedora ya no consultan una por una

`hojasPorVendedora()` hacía un `findMany` por persona dentro del bucle: catorce
vendedoras eran catorce consultas en serie dentro de la descarga, sobre la misma
tabla que la hoja «Detalle» ya recorre entera. Ahora se piden las ventas del mes
de una vez, acotadas a quien va a tener hoja, y se agrupan en memoria.

El riesgo del cambio no es de rendimiento sino de **reparto** —que a alguien le
aparezcan las ventas de otra en la hoja que lleva su nombre—, así que se fija
sobre el .xlsx real en `exportacion-ocultas.spec.ts`, y con `incluirOcultas` para
que las dos vendedoras tengan hoja: sin eso la consulta ya devuelve solo las
filas de quien tiene hoja y un reparto roto pasaría por bueno.
