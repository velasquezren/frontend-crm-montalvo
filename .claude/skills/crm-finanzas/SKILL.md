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

---

## 6. Arquitectura Modular y Subcomponentes

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

## 7. Reglas de Auditoría y Estados de Periodo

- **Exclusiones con Auditoría**: Para marcar `comisionable = false`, el backend exige obligatoriamente `motivoExclusion` (3 a 200 caracteres), registrando autor, fecha y motivo en `AuditLog`. Al reincluir (`comisionable = true`), el motivo se limpia.
- **Inmutabilidad de Periodos Cerrados**: Los periodos en estado `CERRADO` no admiten recálculo, borrado ni cambios en sus filas comisionables.
- **Estado del Plan Informativo**: El campo `estadoPlan` (`APROBADO`, `TERMINADO`, etc.) informa el avance clínico/administrativo pero **no excluye** la venta del cálculo de comisión.

