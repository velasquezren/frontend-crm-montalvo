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
   - Componente: `ReportesPage` (`app-reportes`)
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
