# 8c. El informe de liquidación: el documento que se firma

> Parte de la skill `crm-finanzas`: lee antes su [índice](../SKILL.md).

`GET /periodos/:id/exportar-word` → un **.docx vertical de una hoja**. No es el
Excel en otro formato: el Excel sirve para auditar (20 columnas, hoja por
vendedora, cada venta) y el informe para pagar (7 columnas, tres firmas).

**Word y no PDF**, y lo pidió administración: el informe se revisa y a veces se
anota o se corrige un nombre antes de firmarlo, y un PDF obliga a rehacerlo
desde el sistema por cualquier retoque. Un .docx se edita y se exporta a PDF
desde Word o LibreOffice cuando toca archivarlo. Hubo una versión en PDFKit
antes de eso; el módulo puro no cambió al migrar, porque no depende del formato.

**Nada de navegador.** `docx` es JS puro y arma un documento de ~10 KB en
milisegundos. Puppeteer está descartado en este servidor: `crm_backend.service`
corre con `MemoryMax` de 1,5 GB en una máquina que comparte con Resultados y
ClamAV (medido 2026-09-22), y un Chrome headless por documento es memoria y
CPU que no se le quita al vecino por diez filas. A diferencia del Excel no va en streaming
—un .docx es un ZIP y se arma entero— pero son diez filas, no las 500 del
detalle.

La lógica vive en `informe-liquidacion.ts` (puro: qué fila va en qué bloque,
cuánto suma cada pie, quién firma) y la maquetación en
`exportacion-word.service.ts`.

Decisiones que no son estéticas:

- **Vertical, y por eso siete columnas.** En A4 vertical caben ~17 cm de tabla;
  las 20 de la hoja "Liquidación" necesitarían el triple. Las cuatro comisiones
  van sumadas en una (`comisionesDe()`) y **no hay columna "Total ($us)"**: es
  exactamente `Comisiones + Bonos`, con sus dos sumandos al lado.
- **La columna de nombre se lleva el 31 %.** Con menos, "Canedo Villamor Claudia
  Marcela" se partía en cuatro líneas y la tabla parecía un formulario a medio
  llenar.
- **Sobrio a propósito**: gris muy claro en cabeceras, filetes finos, negro
  sobre blanco. El color de marca es de la interfaz, no del papel — un informe
  con franjas de color se ve de juguete al lado de la planilla que ya usa
  administración.
- **Las tres firmas son fijas** (`FIRMANTES_PLANILLA`, con `ELABORA_PLANILLA`,
  `REVISA_PLANILLA` y `AUTORIZA_PLANILLA`): elabora la jefatura de ventas,
  revisa administración y autoriza la dirección. **No dependen de la sesión** —
  quien baja el archivo no es quien firma, y poner su nombre le atribuía una
  responsabilidad que no es suya.
- **Aviso `DOCUMENTO PRELIMINAR`** si el periodo no está CERRADO/PAGADO. Importa
  más que en un PDF: este archivo es editable y va a circular.
- **`formatearNumero()` a mano, no `Intl`.** Sin ICU completo, `Intl` cae a
  `en-US` en silencio y la planilla sale con `1,396.62` por `1.396,62`.
- **Las firmas van en una tabla sin bordes**, no con tabulaciones: administración
  va a editar el archivo, y unas columnas hechas con tabuladores se desmontan en
  cuanto alguien cambia un nombre por otro más largo.

**Sin sueldos ni "A PAGAR", y con el desglose por tipo.** El informe es de
COMISIONES: los sueldos se pagan por otra vía y en otro momento —en agosto se
liquida enero— así que mezclarlos en la misma fila invita a pagar dos veces lo
mismo. El sitio que dejan libre lo ocupan Tipo A / A RA / B / C, que es lo que
se discute cuando alguien revisa su liquidación. La cabecera lo dice en un
campo "Concepto", no en una nota al pie.
