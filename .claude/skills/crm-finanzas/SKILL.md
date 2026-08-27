---
name: crm-finanzas
description: Arquitectura, reglas de cálculo, liquidación de planillas, analítica médica y consolidado anual para el módulo unificado Finanzas & Comisiones (/finanzas). Úsalo SIEMPRE que trabajes en liquidaciones, comisiones de vendedoras, importación de Excel de FileMaker, analítica de facturación médica, matriz de 12 meses o bonos trimestrales.
---

# Finanzas & Comisiones (`/finanzas`)

Módulo centralizado para la administración contable, liquidación de comisiones comerciales y analítica médica de Clínica Montalvo.

---

## 1. Arquitectura del Hub Unificado

El módulo consolida tres vistas operativas en una sola experiencia fluida bajo la ruta `/finanzas` (rol mínimo: `ADMIN`):

1. **Liquidación Mensual (`tab=liquidacion`)**:
   - Componente: `PlanillaComisionesPage` (`app-planilla-comisiones`)
   - Importación de Excel de FileMaker, cálculo de comisiones individuales, objetivos de paquetes (`PLANPAQ` y `PLANNIN`), retenciones y exportación.
2. **Analítica Médica (`tab=analitica`)**:
   - Componente: `AnaliticaPage` (`app-analitica`), en `features/analitica/`
   - Distribución de ingresos por categoría de servicio, ranking de procedimientos más facturados, médicos tratantes y canales de captación.
3. **Resumen Anual (`tab=anual`)**:
   - Componente: `ResumenAnualPage` (`app-resumen-anual`)
   - Matriz histórica de facturación de 12 meses por vendedora y cálculo de bonos trimestrales (Q1, Q2, Q3, Q4).
4. **Tipo de Cambio (`tab=tipo-cambio`, agregado 2026-08-25)**:
   - Componente: `TipoCambioAdminComponent` (`app-tipo-cambio-admin`), en `features/finanzas/components/tipo-cambio/`
   - Historial diario del TC oficial USD→BOB (backend: módulo `tipo-cambio`, modelo `TipoCambioDiario`) — **no es lo mismo que** `PeriodoComision.tipoCambio`, que es el TC ya fijo de un mes de liquidación cerrado. Un intervalo en el backend intenta traer el valor del día cada 6h de un espejo público del BCB (`fuente: AUTOMATICO`); un ADMIN puede corregir cualquier día a mano (`fuente: MANUAL`), y lo manual siempre gana sobre lo automático de ese mismo día.
   - `MonedaService` (frontend, `core/moneda/`) lee de aquí (`GET /tipo-cambio/vigente`) el TC que usa en toda la app fuera de una liquidación abierta — antes de esto era una constante fija (6,97) que nadie actualizaba.

---

## 2. Retención de Estado Instantánea (0 ms) & Reactividad

- **Paneles con `[hidden]`**: Las tres vistas permanecen montadas en memoria. Alternar entre pestañas toma **0 milisegundos**, sin parpadeos, sin peticiones de red repetidas y preservando intacto el mes seleccionado y la posición del usuario.
- **Sincronización Reactiva con `toSignal`**:
  ```ts
  private readonly queryParams = toSignal(this.route.queryParams);

  protected readonly tabActiva = computed<TabFinanzas>(() => {
    const q = this.queryParams()?.['tab'] as string;
    return (q === 'analitica' || q === 'anual' || q === 'liquidacion') ? q : 'liquidacion';
  });
  ```
- **Redirecciones Transparentes**: Marcadores y enlaces anteriores (`/reportes`, `/planilla-comisiones`, `/comisiones-anual`) redirigen limpiamente a `/finanzas` sin romper enlaces guardados.

---

## 3. Patrón de Vistas Embebidas (`embedded`)

Para evitar la duplicación de cabeceras (`<app-page-header>`) cuando una vista se incrusta dentro del Hub:

```ts
export class PlanillaComisionesPage {
  readonly embedded = input(false);
}
```

En la plantilla HTML:
```html
@if (!embedded()) {
  <app-page-header title="..." subtitle="..." />
}
```

---

## 4. Política de Rendimiento: Cero Animaciones Artificiales

- **Prohibido el uso de `@keyframes` de entrada escalonada (`.aparecer`) o `pageFadeIn`**: Las vistas y tablas deben renderizarse en el acto de forma nativa e instantánea.
- **Sin demoras**: Todo cambio de filtro, mes o pestaña debe reflejarse en tiempo real.

## 5. La base de comisión es SIEMPRE precio × 0,87

Una sola regla, sin excepciones, y conviene desconfiar de cualquier código que
proponga otra:

```
base de cálculo = precio × 0,87
```

El 13 % se descuenta **multiplicando por 0,87, no dividiendo entre 1,13**. Sobre
100 el primero deja 87,00 y el segundo 88,50; la clínica usa el primero. Es
contablemente discutible —para extraer el neto de un precio que ya incluye
impuesto lo correcto sería dividir— pero aquí manda cómo liquida administración.

### El anticipo NO es la base

Hubo una excepción: si la fila traía anticipo, ese monto pasaba a ser la base y
no se le descontaba nada, con el argumento de que "FileMaker ya lo entrega
neto". **Es falso.** Contrastado contra `BDEjecutivas` de
`CALCULO COMISION DICIEMBRE 2025.xlsx`, que es donde administración calcula:

| | |
|---|---|
| `INGRESO NETO = precio × 0,87` | **356 de 356 filas** |
| `INGRESO NETO = anticipo` | **0 de 356** |
| `MONTO VENDIDO = precio` | **356 de 356** |

Incluidas las 20 filas que traen anticipo. Ejemplo: *Plan Nacer Cesárea 1er
trimestre*, precio 3.236,52 y anticipo 323,65, liquida sobre **2.815,78** —que
es `3.236,52 × 0,87`— y no sobre los 323,65.

La vendedora cobra por **vender** el plan, no al ritmo al que la paciente lo
paga. Por eso el mismo plan aparece con precio idéntico en cada fila: ese precio
es el del catálogo, no lo cobrado, y lo único que cambia entre filas es qué
paciente lo compró.

**Cómo se coló:** la verificación fue circular. Se comprobó que el `ingresoNeto`
guardado coincidía con el anticipo, y coincidía porque el propio código lo había
escrito así. Contra el Excel nunca se contrastó. La regla dejaba la base de enero
corta en **24.974 USD sobre 30 filas**, y alta en las que el anticipo superaba al
precio.

El anticipo sigue viajando y se muestra en la columna «Pagado», pero es
**informativo**: dice quién va al día y quién debe, y destapa los cobros por
encima del precio de catálogo (cinco en enero). No toca la comisión.

### Puntos porcentuales vs. fracción: dos convenciones conviven, y ya chocaron tres veces

`pctEmpresa`/`pctPropio` de cualquier tarifa y `PCT_TIPO_C_RA` nacen en **puntos
porcentuales** (`4.5` = 4,5%) — así los siembra el backend y así los consume el
motor (`comisionUsd = base * porcentaje / 100`). `FACTOR_BONO_JEFATURA` y
`FACTOR_BONO_TRIMESTRAL` son **fracción** (`0.002` = 0,2%) y sí necesitan `×100`
para mostrarse. Mismo prefijo "porcentaje", dos unidades — tratarlas igual ya
rompió tres veces de forma independiente: el motor de cálculo (que siempre
estuvo bien), la exportación a Excel del backend y el panel "Liquidado con
estas reglas" de este frontend multiplicaron por 100 de más, un 4,5% saliendo
como 450%. La corrección de acá también arregló el *hint* del campo en
Configuración, que decía "0,045 = 4,5%" — la unidad contraria a la que usa el
motor; seguirlo al pie de la letra habría liquidado 0,045% en vez de 4,5%.

**Antes de mostrar o multiplicar un `%`, confirma la unidad contra el motor
(`calculo-comisiones.service.ts` en el backend) o el sembrado
(`configuracion-por-defecto.ts`) — nunca contra el nombre del campo ni contra
otro `%` de la misma pantalla.**

---

## 6. El tipo de cambio pertenece al DATO, no a la pantalla

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

## 7. Arquitectura Modular y Subcomponentes

Para evitar código espagueti y archivos monolíticos, `PlanillaComisionesPage` delega sus responsabilidades a subcomponentes `OnPush` reutilizables:

1. **`<app-tabla-liquidacion>` (`TablaLiquidacionComponent`)**:
   - Renderiza la matriz contable por vendedora.
   - Muestra Tipo A, Tipo B (cirugías), Tipo C (servicios), bonos de jefatura/trimestral, sueldo base, total USD y total BOB (calculado con `tipoCambio` oficial del periodo).

2. **`<app-configuracion-comisiones>` (`ConfiguracionComisionesComponent`)**:
   - Subcomponente aislado para las 9 secciones de configuración:
     1. Palancas globales (`PCT_TIPO_C_RA`, `FACTOR_BONO_JEFATURA`, `FACTOR_BONO_TRIMESTRAL`, `MESES_BONO_TRIMESTRAL`).
     2. Directorio de vendedoras (sueldo base, tipo y área).
     3. Tarifas Tipo A (Planes).
     4. Tarifas Tipo C (Servicios).
     5. Escala Tipo B (Cirugías por volumen mensual).
     6. Histórico RA (Procedimientos de reproducción asistida descontinuados).
     7. Canales de captación (Mapeo empresa vs. propia).
     8. Metas comerciales (Base vs. específicas del mes).
     9. Diccionario de clasificación por patrón de texto.

3. **`<app-seleccion-planes>` (`SeleccionPlanesComponent`)**:
   - Subcomponente que agrupa los planes por vendedora y tipo (`PLANPAQ`, `PLANNIN`).
   - Aplica la franquicia (`vendidos − objetivo`) y permite alternar planes elegidos a mano vs. automáticos (menor base).

---

## 8. Reglas de Auditoría y Estados de Periodo

- **Exclusiones con Auditoría**: Para marcar `comisionable = false`, el backend exige obligatoriamente `motivoExclusion` (3 a 200 caracteres), registrando autor, fecha y motivo en `AuditLog`. Al reincluir (`comisionable = true`), el motivo se limpia.
- **Inmutabilidad de Periodos Cerrados**: Los periodos en estado `CERRADO` no admiten recálculo, borrado ni cambios en sus filas comisionables.
- **Estado del Plan Informativo**: El campo `estadoPlan` (`APROBADO`, `TERMINADO`, etc.) informa el avance clínico/administrativo pero **no excluye** la venta del cálculo de comisión.

