# 3. Vistas embebidas: `embedded` y `activo`

> Parte de la skill `crm-finanzas`: lee antes su [índice](../SKILL.md).

Las cuatro vistas del hub son además rutas propias, así que cada una recibe dos
interruptores del hub. **Son cosas distintas y hacen falta las dos.**

`embedded` evita duplicar la cabecera:

```ts
export class PlanillaComisionesPage {
  readonly embedded = input(false);
}
```

```html
@if (!embedded()) {
  <app-page-header title="..." subtitle="..." />
}
```

`activo` dice cuál es la pestaña que se está mirando, y **solo lo llevan las dos
vistas que escriben el tipo de cambio global**: `PlanillaComisionesPage` y
`DesempenoAgentesComponent`.

```ts
readonly activo = input(true);

effect(() => {
  if (!this.activo()) return;
  const tc = Number(this.periodoActual()?.tipoCambio);
  if (tc > 0) this.monedaService.setTipoCambio(tc);
});
```

> **Por qué.** Las dos imponen el TC de SU periodo al `MonedaService`, que es
> global (ver §6 de este skill: una liquidación se lee con el TC del mes con que se
> liquidó, no con el de hoy). En el hub están montadas a la vez, así que sin este
> interruptor bastaba pasar el cursor por la pestaña de Desempeño —que ya la
> monta— para que las cifras en bolivianos de la pestaña que se estaba mirando
> saltaran solas a otro número.
>
> El efecto **solo escribe cuando está activo; no restaura al desactivarse**. Con
> las dos vistas vivas, un "restaurar al desactivarme" compite con el "fijar el
> mío" de la otra en el mismo ciclo y gana el que corra último. El global se
> restaura donde no hay carrera: en `ngOnDestroy`, al salir del hub.

---
