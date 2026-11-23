# 8d. Las métricas en PDF: el acompañante del informe

> Parte de la skill `crm-finanzas`: lee antes su [índice](../SKILL.md).

`GET /periodos/:id/exportar-metricas` → PDF vertical con el panorama del equipo
(4 KPIs, facturación y comisión por vendedora en barras, y de qué está hecha la
comisión del equipo) más una ficha por vendedora, tres por página.

**Es el acompañante del Word, no su sustituto**: el Word se firma, esto se
imprime y se adjunta. Responde lo que una tabla no contesta —quién vendió más,
de dónde salió la comisión de cada quien, quién cumplió su objetivo— así que no
lleva firmas ni pide usuario.

- **Los gráficos se dibujan a mano con PDFKit.** Una barra es un rectángulo;
  meter Chart.js obligaría a `node-canvas` (binario nativo) o a un navegador,
  que es justo lo que no cabe en `MemoryMax=400M`.
- **Acá el color SÍ va**, al revés que en el Word: en un gráfico no decora, es
  lo que separa una serie de otra. Rampa derivada del verde de la marca, cinco
  tonos de oscuro a claro — ni arcoíris ni escala de grises, que con cinco
  segmentos deja de distinguirse.
- **Barras horizontales**, porque la etiqueta es un nombre completo: en vertical
  habría que rotarlo, y un informe donde hay que girar la cabeza no lo lee nadie.
- **El objetivo de planes se deduce** (`vendidos − comisionables`): no se guarda
  en la fila, y es lo que explica un Tipo A en cero mucho mejor que el cero.
- `formatearPorcentaje()` fuerza coma decimal: `toFixed()` da punto, y "1.85 %"
  junto a "42.725,33" mezcla dos convenciones en la misma línea.

Los dos se descargan desde la barra del periodo y desde cada fila de "Planillas
cargadas en el sistema", para bajar varios meses seguidos sin abrirlos.
Pruebas: `informe-liquidacion.spec.ts`.
