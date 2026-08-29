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

## 8. Ciclo de vida de un mes: quién puede cerrarlo y cuándo

```
BORRADOR ──calcular──▶ CALCULADO ──enviar a revisión──▶ EN_REVISION
    ▲                    │  ▲                            │      │
    └──reimportar────────┘  └───rechazar (con motivo)─────┘      │ aprueban todos
                            ▲                                    ▼
                            └──reabrir (SUPER_ADMIN + motivo)── CERRADO ──pagar──▶ PAGADO
```

**Las transiciones legales viven en `estados-periodo.ts` (backend) y se validan
ahí.** No las repliques en el frontend: la página pide `GET /periodos/:id/revision`
y pinta lo que le digan. Dos copias de la tabla acaban diciendo cosas distintas
y gana la que no manda.

### Por qué no hay un endpoint que reciba el estado destino

Lo hubo (`PATCH /periodos/:id/estado`) y era el agujero principal:
`update({ data: { estado } })` con el valor que llegara, sin comprobar el salto.
`CERRADO → BORRADOR` era legal, así que el candado de un mes pagado dependía de
que nadie eligiera mal en un desplegable. Y los permisos estaban al revés:
borrar un periodo pedía SUPER_ADMIN, pero reabrirlo —que permite recalcular y
cambiar lo que a alguien ya se le pagó— se conformaba con ADMIN.

Ahora cada paso es su propia ruta (`revision`, `aprobar`, `rechazar`, `reabrir`,
`pagar`) con sus permisos y los datos que exige. **Preparar es ADMIN; decidir es
SUPER_ADMIN**, rechazar incluido: invalida las firmas de los demás y no puede
quedar en manos de quien preparó la planilla.

### La compuerta importa más que el número de estados

`bloqueosParaRevision()` impide mandar a revisar un mes con filas sin clasificar,
sin vendedora, con vendedoras sin configurar, o sin liquidar. Un flujo de
aprobaciones que deja firmar un mes con cuarenta filas sin clasificar no protege
nada: solo reparte la firma de un número que ya estaba mal. Los datos ya los
calculaba `alertas()` desde antes; lo que faltaba era que alguno bloqueara algo.

Se devuelven también en el `GET`, para que la pantalla diga qué falta **antes**
de que alguien pulse y se lleve un 409.

### "Todos aprobaron" se evalúa contra los SUPER_ADMIN de AHORA

Las aprobaciones son filas de `AprobacionPeriodo`, no un valor del enum: con un
estado "medio aprobado" no se puede responder *quién falta*. El conjunto exigido
se recalcula en cada lectura, **nunca se congela al abrir la revisión**, porque
un SUPER_ADMIN puede bajar a ADMIN en cualquier momento:

- **Baja a ADMIN o se desactiva** → deja de sumar y también de bloquear.
- **Entra un SUPER_ADMIN nuevo** → el mes vuelve a pendiente: no ha visto las cifras.
- **Cero SUPER_ADMIN activos** → NO se da por aprobado. "Todos aprobaron" sobre
  un conjunto vacío es verdadero, y sin el `aprobaron.length > 0` el mes se
  cerraría solo, sin una sola firma, el día que la clínica se quedara sin
  SUPER_ADMIN.

Un rechazo o una reapertura **borran todas las aprobaciones**, también las de
quien no rechazó: una firma vale para las cifras que se firmaron.

### Detalles que no son cosméticos

- **`EN_REVISION` congela la edición.** Las guardas de `importar`, `ajustarVenta`,
  `eliminarPeriodo`, `reclasificarConRegla` y `calcular` pasaron de comparar con
  `CERRADO` a llamar a `esEditable()`. Eran cinco comprobaciones idénticas
  escritas a mano; con el estado nuevo, las cinco habrían seguido dejando editar
  un mes en revisión, cada una en su archivo y sin que nada avisara.
- **`PAGADO` es terminal.** Un error se corrige con un ajuste en el mes
  siguiente, no reescribiendo el mes pagado.
- **Reabrir guarda en `AuditLog` la foto de configuración que va a perderse.**
  `configuracionUsada` se pisa en cada cálculo, así que reabrir y recalcular
  borraba la única respuesta a "¿con qué reglas se pagó este mes?". El schema ya
  dice que el historial de intentos vive en `AuditLog`: la foto viaja ahí.
- **El cierre no es un botón.** Es la consecuencia de que se complete el
  conjunto de firmas. Con un paso manual habría un hueco en el que el mes está
  aprobado y todavía editable.

Pruebas: `estados-periodo.spec.ts` (reglas puras, incluido el SUPER_ADMIN que
baja a ADMIN) y `cierre-periodo.spec.ts` (que el servicio las use).

- **Exclusiones con Auditoría**: Para marcar `comisionable = false`, el backend exige obligatoriamente `motivoExclusion` (3 a 200 caracteres), registrando autor, fecha y motivo en `AuditLog`. Al reincluir (`comisionable = true`), el motivo se limpia.
- **Estado del Plan Informativo**: El campo `estadoPlan` (`APROBADO`, `TERMINADO`, etc.) informa el avance clínico/administrativo pero **no excluye** la venta del cálculo de comisión.

## 8b. El equipo de marketing: cobra sin vender

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

## 8c. El informe de liquidación: el documento que se firma

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
corre con `MemoryMax=400M` sobre un VPS de 1,7 GB compartido, y un Chrome
headless pide más que eso él solo. A diferencia del Excel no va en streaming
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
- **`Elaborado` y `Revisado` salen del usuario de la sesión**; `Autorizado` es
  fijo (`AUTORIZA_PLANILLA`). Sin usuario la línea queda **en blanco** para
  firmar a mano: poner "Sistema" sería atribuir una revisión que nadie hizo.
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

## 8d. Las métricas en PDF: el acompañante del informe

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

## 9. Vendedoras dadas de baja: se oculta la persona, nunca el dinero

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

