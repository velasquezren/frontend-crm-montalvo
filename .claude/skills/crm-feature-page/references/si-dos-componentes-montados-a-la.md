# Si dos componentes montados a la vez pintan el mismo recurso, la invalidación va en el SERVICIO

> Parte de la skill `crm-feature-page`: lee antes su [índice](../SKILL.md).

Recargar «lo mío» después de mutar funciona mientras el recurso lo pinte un solo
sitio. En cuanto lo pinta también algo que vive en el layout —y por tanto está
montado **siempre**— deja de funcionar, sin error y sin que las pruebas se
enteren: el otro se queda con el número viejo.

**La cicatriz (2026-09-14).** La campana (`notificaciones-bell`, en el layout) y
la página de Actividades tenían cada una su `httpResource` del mismo
`/actividades/resumen`. La página recargaba sus tres recursos tras cada mutación
—el mismo bloque de tres líneas copiado **cinco veces**— pero nada avisaba a la
campana. Completar una reunión dejaba el badge con el número viejo hasta el
respaldo de 60 s, así que la agente recargaba la página. «Actividad Rápida»
desde el chat tenía el mismo fallo al crear.

**La regla:** el estado remoto compartido se invalida en el servicio de dominio,
no en cada página. Un contador de mutaciones basta:

```ts
private readonly mutaciones = signal(0);
readonly cambios = this.mutaciones.asReadonly();

private async tras<T>(operacion: Promise<T>): Promise<T> {
  const resultado = await operacion;
  this.mutaciones.update(n => n + 1);   // solo si salió bien
  return resultado;
}
```

Y cada consumidor reacciona una vez, sin saber quién más pinta lo mismo:

```ts
let vistas = this.servicio.cambios();
effect(() => {
  const n = this.servicio.cambios();
  if (n === vistas) return;          // 1ª ejecución: el recurso ya se pidió solo
  vistas = n;
  untracked(() => this.recurso.reload());
});
```

Los dos detalles que no son opcionales:

- **`untracked`**: `reload()` escribe los signals internos del recurso. Sin él,
  el effect se suscribe a lo que él mismo provoca — la familia de fallo que
  documenta `crm-rendimiento`.
- **Saltarse la primera ejecución**: un `effect` corre al crearse y el
  `httpResource` ya se pide solo, así que sin el guard se duplica la petición
  de arranque.

**Cómo se detecta el caso:** buscar qué método `*Request()` de un servicio se
llama desde dos componentes. Solo importa si pueden estar montados a la vez —
dos páginas son rutas distintas y nunca coinciden; el layout coincide con todas.
