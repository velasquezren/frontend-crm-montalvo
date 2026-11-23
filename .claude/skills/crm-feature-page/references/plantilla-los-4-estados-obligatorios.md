# Plantilla: los 4 estados obligatorios

> Parte de la skill `crm-feature-page`: lee antes su [índice](../SKILL.md).

Toda vista con datos remotos cubre carga, error, vacío y contenido:

```html
@if (clientes.isLoading()) {
  <app-loading-skeleton shape="text" height="2.5rem" />
} @else if (clientes.error()) {
  <app-empty-state icon="alert-circle" title="No se pudo cargar…"
    description="Verifica que el servidor esté encendido." />
} @else if (clientes.value().datos.length > 0) {
  <app-table>…</app-table>
  <app-paginator
    [pagina]="clientes.value().pagina"
    [totalPaginas]="clientes.value().totalPaginas"
    [total]="clientes.value().total"
    [limite]="clientes.value().limite"
    (cambiar)="pagina.set($event)" />
} @else {
  <app-empty-state icon="users" title="Sin resultados" description="…" />
}
```

**El estado de error no es opcional, y el build lo comprueba.** Faltaba en seis de las doce
vistas, y su ausencia no se veía como un hueco sino como una **mentira**: sin esa rama, un
backend caído cae en el `@empty` y la pantalla afirma "no hay clientes" o "no hay comisiones".
El agente lo lee como un dato —"hoy no hay nada"— y cierra. En desarrollo no se nota porque el
servidor siempre responde.

Se resuelve con el átomo, no maquetando el bloque en cada vista:

```html
@if (clientes.isLoading()) {
  <app-loading-skeleton … />
} @else if (clientes.error()) {
  <app-error-carga que="los clientes" (reintentar)="clientes.reload()" />
} @else if (clientes.value().datos.length > 0) {
  …
} @else {
  <app-empty-state … />
}
```

El orden importa: el error va **antes** de leer datos. En Angular (21 y 22), `.value()`
puede lanzar cuando el recurso está en error, incluso con `defaultValue`.
En derivados que se evalúan fuera de esa rama de la plantilla, comprobar
`.hasValue()` antes de leer `.value()` y ofrecer un respaldo tipado. Véanse
`NuevaCampanaComponent.lineas/plantillas` y `CampanaAudienciaComponent.resumen`, con pruebas
HTTP que fuerzan 502/503. Un fallo no debe convertirse en «no hay datos» ni
interrumpir el render antes de mostrar el error y el botón de reintento.

`npm run check:skills` falla si una vista usa `httpResource` y su plantilla no declara error.

**Lo que se pinta FUERA de la rama de contenido lee `valorOVacio()`**
(`core/api/valor-o-vacio.ts`): los chips con su contador, las tarjetas de KPI, el selector de
agentes, los inputs de un hijo que recibe su propio `[error]`. El 2026-10-09 había nueve
pantallas —Clientes, Ventas, Leads, Actividades, Líneas, Servicios, Perfil, Nuevo chat,
Resultados— donde un contador ARRIBA de la tabla leía `x.value()`: con la carga en error la
plantilla lanzaba y la pantalla se rompía justo en vez de mostrar el «Reintentar» que tenía
debajo. El build lo comprueba (`verificarLecturaAntesDelError`): una plantilla no puede leer
`x.value()` antes de `x.error()` salvo con `x.hasValue()` o `x.isLoading() &&` en la misma
línea; y un `effect` que lee `x.value()` tiene que preguntar antes `hasValue()`/`status()`
(`verificarEfectosConRecurso`). Finanzas y Comisiones tienen esa deuda congelada: solo baja.

Todo listado paginado llega envuelto en `RespuestaPaginada<T>` (`core/api/pagination.model.ts`):
usa `.value().datos`, nunca `.value()` a secas — ya no es un array plano. Cambiar de filtro o de
búsqueda vuelve la página a 1 (si no, el usuario queda "atrapado" en una página que ya no existe
para el nuevo filtro).

Control de flujo: `@if` / `@for` (siempre con `track`) / `@switch` / `@empty`. Prohibido `*ngIf` y `*ngFor`.
