---
name: crm-finanzas
description: Arquitectura, reglas de cálculo, liquidación de planillas, analítica médica y consolidado anual para el módulo unificado Finanzas & Comisiones (/finanzas). Úsalo SIEMPRE que trabajes en liquidaciones, comisiones de vendedoras, importación de Excel de FileMaker, analítica de facturación médica, matriz de 12 meses o bonos trimestrales.
---

# Finanzas & Comisiones (`/finanzas`)

Módulo centralizado para la administración contable, liquidación de comisiones comerciales y analítica médica de Clínica Montalvo.

---

## 1. Arquitectura del Hub Unificado

El módulo consolida **cinco** vistas operativas en una sola experiencia fluida bajo la ruta `/finanzas` (rol mínimo: `ADMIN`). La lista viva es `TABS` en `finanzas.page.ts` — si no coincide con esto, manda el código:

1. **Liquidación Mensual (`tab=liquidacion`)**:
   - Componente: `PlanillaComisionesPage` (`app-planilla-comisiones`)
   - Importación de Excel de FileMaker, cálculo de comisiones individuales, objetivos de paquetes (`PLANPAQ` y `PLANNIN`), retenciones y exportación.
2. **Desempeño de Agentes (`tab=agentes`)**:
   - Componente: `DesempenoAgentesComponent` (`app-desempeno-agentes`), en `features/finanzas/components/desempeno-agentes/`
   - Ficha individual por vendedora: cabecera, metas, ventas del mes y composición del pago. Es una de las dos vistas que **escriben el TC global** (ver §3) y la **única** ruta para abrir la ficha de una vendedora dada de baja (ver §9).

3. **Analítica Médica (`tab=analitica`)**:
   - Componente: `AnaliticaPage` (`app-analitica`), en `features/analitica/`
   - Distribución de ingresos por categoría de servicio, ranking de procedimientos más facturados, médicos tratantes y canales de captación.
4. **Resumen Anual (`tab=anual`)**:
   - Componente: `ResumenAnualPage` (`app-resumen-anual`)
   - Matriz histórica de facturación de 12 meses por vendedora y cálculo de bonos trimestrales (Q1, Q2, Q3, Q4).
5. **Tipo de Cambio (`tab=tipo-cambio`, agregado 2026-08-25)**:
   - Componente: `TipoCambioAdminComponent` (`app-tipo-cambio-admin`), en `features/finanzas/components/tipo-cambio/`
   - Historial diario del TC oficial USD→BOB (backend: módulo `tipo-cambio`, modelo `TipoCambioDiario`) — **no es lo mismo que** `PeriodoComision.tipoCambio`, que es el TC ya fijo de un mes de liquidación cerrado. Un intervalo en el backend intenta traer el valor del día cada 6h de un espejo público del BCB (`fuente: AUTOMATICO`); un ADMIN puede corregir cualquier día a mano (`fuente: MANUAL`), y lo manual siempre gana sobre lo automático de ese mismo día.
   - `MonedaService` (frontend, `core/moneda/`) lee de aquí (`GET /tipo-cambio/vigente`) el TC que usa en toda la app fuera de una liquidación abierta — antes de esto era una constante fija (6,97) que nadie actualizaba.

---

## Referencias por tema (carga solo la que toque)

Cada archivo es una sección completa de esta skill; no hace falta leerlas todas.

- [2. Retención de Estado Instantánea (0 ms) & Reactividad](references/retencion-de-estado-instantanea-reactividad.md) — decide si el componente EXISTE —y por tanto si pide sus datos—; se enciende al
- [3. Vistas embebidas: `embedded` y `activo`](references/vistas-embebidas-embedded-y-activo.md) — Las cuatro vistas del hub son además rutas propias, así que cada una recibe dos
- [4. Política de Rendimiento: Cero Animaciones Artificiales](references/politica-de-rendimiento-cero-animaciones-artificiales.md)
- [4b. Las cachés del módulo, y quién tiene que tirarlas](references/las-caches-del-modulo-y-quien.md) — Tres cachés en memoria sirven este módulo, todas con
- [4c. La pestaña Analítica tiene CINCO cubos, no cuatro](references/la-pestana-analitica-tiene-cinco-cubos.md) — comisionTotalUsd = comisionA + comisionTipoARA + comisionB + comisionC + bonos.
- [6. El tipo de cambio pertenece al DATO, no a la pantalla](references/el-tipo-de-cambio-pertenece-al.md) — El toggle Bs/$us (MonedaToggleComponent → MonedaService) es global y una
- [7. Arquitectura Modular y Subcomponentes](references/arquitectura-modular-y-subcomponentes.md) — Para evitar código espagueti y archivos monolíticos, PlanillaComisionesPage delega sus responsabilidades a subcompone…
- [8. Ciclo de vida de un mes: quién puede cerrarlo y cuándo](references/ciclo-de-vida-de-un-mes.md) — BORRADOR ──calcular──▶ CALCULADO ──enviar a revisión──▶ EN_REVISION
- [8b. El equipo de marketing: cobra sin vender](references/el-equipo-de-marketing-cobra-sin.md) — No tiene rol propio y no debe tenerlo. Rol (SUPER_ADMIN / ADMIN / AGENTE)
- [8c. El informe de liquidación: el documento que se firma](references/el-informe-de-liquidacion-el-documento.md) — GET /periodos/:id/exportar-word → un .docx vertical de una hoja. No es el
- [8d. Las métricas en PDF: el acompañante del informe](references/las-metricas-en-pdf-el-acompanante.md) — GET /periodos/:id/exportar-metricas → PDF vertical con el panorama del equipo
- [8e. El Excel NO va en streaming, aunque el código lo dijera](references/el-excel-no-va-en-streaming.md) — exportacion-comisiones.service.ts afirmaba que «un mes de 500 filas y uno de
- [9. Vendedoras dadas de baja: se oculta la persona, nunca el dinero](references/vendedoras-dadas-de-baja-se-oculta.md) — VendedoraComision.oculta es para quien ya no trabaja en la clínica. No es

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
