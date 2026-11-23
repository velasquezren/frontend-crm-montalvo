# 6. El tipo de cambio pertenece al DATO, no a la pantalla

> Parte de la skill `crm-finanzas`: lee antes su [índice](../SKILL.md).

El toggle Bs/$us (`MonedaToggleComponent` → `MonedaService`) es **global y una
sola instancia para todo el CRM**. Eso lo vuelve una trampa para cualquier vista
que muestre cifras de un mes ya liquidado, porque el TC que usa por defecto es
el **vigente hoy** (`GET /tipo-cambio/vigente`), no el del mes que estás viendo.

**La regla, sin excepciones: un monto histórico se convierte con el TC de su
propio periodo.** El TC no es una propiedad del sistema hoy — es una propiedad
del dato. Cada venta se liquidó con el TC de su mes y ese número quedó fijo para
siempre; el toggle solo cambia *cómo lo leés*, nunca *con qué tasa se calculó*.

La magnitud no es cosmética: enero de 2026 se liquidó a **6,97** y el vigente en
agosto ronda **10**. Convertir enero con el TC de agosto da ~40 % de error, en
una pantalla de remuneración que las ejecutivas leen para saber cuánto cobran.

### Antes que nada: el CRM opera a un tipo de cambio FIJO

`ConfiguracionTipoCambio` (fila única, módulo `tipo-cambio`) decide con qué
convierte **todo** el CRM:

| Modo | `GET /tipo-cambio/vigente` devuelve |
|---|---|
| `FIJO` (por defecto, 6,97) | el valor pactado con el que opera la clínica |
| `AUTOMATICO` | el último de la serie diaria del BCB |

Está en FIJO porque **así se liquidan las comisiones**: los seis periodos de
2026 se calcularon a 6,97 y así viene el `tc` del Excel de FileMaker. El TCO
oficial se despegó —11,92 el 29/8/2026, un **+71 %**— y mientras `vigente()`
devolvía la serie diaria, el selector Bs/$us convertía toda la app con un número
que no se corresponde con ninguna cifra pagada.

Tres cosas que conviene no deshacer:

- **La serie se sigue recolectando en modo FIJO.** No se apaga el
  sincronizador: cambiar de modo es un clic desde la pantalla, sin desplegar,
  para el día que la clínica pase a operar al oficial. Por eso es una tabla y
  no una variable de entorno.
- **Cambiar el modo NO reescribe nada.** Cada liquidación guarda su
  `PeriodoComision.tipoCambio` y las vistas de un periodo lo siguen usando —
  todo lo de abajo sobre el pineo sigue vigente y es lo que protege el
  histórico el día que se vuelva a AUTOMATICO.
- **`fuente: 'FIJO'` se declara, no se disfraza de oficial.** `MonedaService`
  lo distingue de `respaldo`: avisar de "no se pudo cargar" sobre un valor
  correcto enseña a ignorar el aviso de cuando sí falla.

**Al importar, el Excel dejó de mandar sobre el TC** (`resolverTipoCambio()`):
en modo FIJO el periodo se liquida con el valor configurado y solo se registra
un `warn` si el archivo traía otro. El `tc` de FileMaker es una celda que
alguien teclea cada mes, y de ahí salía el número por el que se multiplica todo
lo que se paga — un dedazo ahí no da error, da una planilla entera mal.

### Los dos mecanismos, y cuándo va cada uno

**1. Vista de UN periodo → pinear el TC de ese periodo.** `setTipoCambio(tc)` al
entrar, `restaurarTipoCambioGlobal()` en `ngOnDestroy`:

```ts
effect(() => {
  const tc = Number(this.periodo()?.tipoCambio);
  if (tc > 0) this.monedaService.setTipoCambio(tc);
});

ngOnDestroy(): void {
  this.monedaService.restaurarTipoCambioGlobal();  // sin esto, el TC del mes
}                                                  // se filtra al resto del CRM
```

**2. Vista que cruza VARIOS periodos → TC explícito por celda**, tercer
argumento del pipe. Pinear no sirve: no existe un TC correcto para doce meses.

```html
{{ mes.montoVendido | moneda: 'USD': mes.tipoCambio }}   <!-- celda de UN mes -->
{{ totalAnual()     | moneda: 'USD': tcReferencia() }}   <!-- suma de varios -->
```

`ResumenAnual.tcReferencia` (TC del periodo más reciente del año) es una
**aproximación declarada** para lo que suma meses con tasas distintas —total
anual, promedio, trimestres—, el mismo criterio que el backend ya usaba para
`bonoBob`. No pretende ser exacto porque no puede serlo; lo que no se acepta es
usar el TC de hoy y aparentar exactitud.

### Cómo entró, y por qué costó verlo (2026-08-26)

El mecanismo de pineo **existía y estaba bien** en
`planilla-comisiones.page.ts`, con un comentario explicando exactamente este
riesgo. Simplemente no se aplicó al escribir las otras dos vistas:

| Vista | Estado antes | Arreglo |
|---|---|---|
| `planilla-comisiones.page.ts` | correcto desde siempre | — |
| `desempeno-agentes.component.ts` | calculaba `tipoCambio()` del periodo y **nunca lo usaba** | pin + restore |
| `resumen-anual.page.html` | 12 meses con el TC vigente | `tipoCambio` por mes, nuevo campo del backend |

El caso de `desempeno-agentes` es el más instructivo: el `computed` con el TC
correcto estaba ahí, a la vista, sin conectar a nada. Un patrón que vive en una
pantalla no se propaga solo a las demás — **si agregás una vista que muestre
cifras de un periodo, el pineo es tuyo, no lo heredás.**

**Cómo verificarlo sin adivinar**: tomá una cifra en Bs de la pantalla, dividila
por el TC del periodo y comparala con lo que muestra el toggle en $us. Debe dar
idéntico. Ejemplo real de la ficha de enero: `Bs 9.721,64 ÷ 6,97 = $us 1.394,78`,
que es exactamente lo que pinta la UI. Con el bug, habría mostrado ~972.
