# 9. Vendedoras dadas de baja: se oculta la persona, nunca el dinero

> Parte de la skill `crm-finanzas`: lee antes su [índice](../SKILL.md).

`VendedoraComision.oculta` es para quien ya no trabaja en la clínica. **No es
`activa`, y confundirlas destruye historia:**

| | Qué hace |
|---|---|
| `activa: false` | La saca del **motor de cálculo**. Recalcular un mes en el que sí trabajó le borra la comisión de ese mes. |
| `oculta: true` | No toca ni un número. Solo deja de **listarse** donde la protagonista es la persona. |

Tres reglas, y ninguna es simetría casual:

**1. El filtro vive en el servidor, en un solo punto.** `reporteConsolidado()`
es el origen de la planilla en pantalla, del desglose, de `reportePlanilla`,
`reporteBonos` y de las cuatro hojas "por persona" del Excel. Filtrar ahí —y
recalcular los totales sobre las filas que devuelve— es lo que impide que una
de esas vistas se olvide. **Nunca filtres en la plantilla**: el pie del informe
seguiría sumando a quien no está listada, y un informe que no cuadra consigo
mismo es peor que uno incompleto.

**2. Se oculta la persona, no el dinero.** Sus ventas siguen contando en la
facturación (Resumen, Distribución, Rankings, Detalle línea a línea): es
ingreso de la clínica y borrarlo haría que el informe mintiera sobre el mes.

**3. La ausencia se declara, siempre.** `ocultas` viaja en la respuesta aunque
no se listen, el Excel las nombra en el Resumen y al pie de la Liquidación, y la
pantalla lo dice arriba del consolidado. Sin eso, los totales cuadran con sus
filas y aun así falta gente: quien cotejara contra su propio Excel buscaría un
error de cálculo que no existe. Mismo criterio que la cobertura de pacientes en
Historial — un dato incómodo escondido no se arregla nunca.

**Ocultar nunca puede significar "irrecuperable".** Cada vista que filtra tiene
que dejar una puerta de vuelta, y no todas cuestan lo mismo:

| Vista | Puerta |
|---|---|
| Reportes (`planilla-comisiones.page`) | interruptor «Mostrarlas» sobre el consolidado |
| Desempeño (`desempeno-agentes`) | chip «Dadas de baja» junto a las ejecutivas |
| Resumen anual | no la tiene: solo declara quiénes faltan y a dónde ir |
| Configuración → Vendedoras | chip «Dadas de baja»: es el único sitio desde donde se reincorpora, así que `listarVendedoras()` NO filtra |

El caso de Desempeño es el que enseña la regla: su lista de chips es la **única**
forma de abrir una ficha, así que al empezar a filtrar el consolidado esa
persona quedaba sin ninguna ruta de acceso en toda la interfaz — filtrada por un
cambio hecho en otra pantalla. Si añadís una vista que consuma
`reporteConsolidado()`, la puerta de vuelta es tuya.

`ResumenAnualService` también tiene su escape: NO aplica el filtro cuando se
pide una vendedora concreta (`soloVendedoraId`). Hoy ningún endpoint pasa ese
parámetro —`GET /anual` siempre llega sin él— así que es una salvaguarda para
cuando se cablee, no una ruta viva; no cuentes con ella para dar por resuelta la
accesibilidad de una ficha.

En la interfaz, **lo que se ve es lo que se exporta**: el interruptor
«Mostrarlas» de Reportes gobierna también el Excel (`incluirOcultas`). Dos
controles distintos —uno para la pantalla y otro para el archivo— es cómo se
acaba descargando un informe que no se parece al que se estaba mirando.

Ocultar exige motivo (el backend responde 400 sin él) por lo mismo que excluir
una venta: el efecto es que una persona desaparece de la planilla que se firma.
Reincorporarla borra motivo y fecha, para que no figure en los informes y "de
baja por despido" a la vez.

Pruebas que lo fijan: `ocultar-vendedora.spec.ts` (la regla del motivo),
`consolidado-ocultas.spec.ts` (filtro y totales) y `exportacion-ocultas.spec.ts`
(sobre el .xlsx real, incluida la hoja individual).
