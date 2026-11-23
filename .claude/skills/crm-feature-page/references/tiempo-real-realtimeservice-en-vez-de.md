# Tiempo real: `RealtimeService` en vez de polling ciego

> Parte de la skill `crm-feature-page`: lee antes su [índice](../SKILL.md).

Un `setInterval` que recarga todo cada N segundos, siempre, haya o no algo
nuevo, es el último recurso — no el primero. Para vistas que reciben cambios
de otro actor (el inbox de Conversaciones recibiendo mensajes de WhatsApp),
usa `RealtimeService` (`core/realtime/realtime.service.ts`): un socket
compartido por sesión que expone `actividad` como signal, y que se conecta
igual que `DialogService` se abre — con auto-limpieza por `DestroyRef`, sin
`OnDestroy` manual.

```ts
constructor() {
  this.realtimeService.conectar(inject(DestroyRef));

  effect(() => {
    const aviso = this.realtimeService.actividad();
    if (!aviso) return;
    this.conversaciones.reload();               // solo lo que puede haber cambiado
    if (this.seleccionadaId() === aviso.conversacionId) {
      this.detalle.reload();
    }
  });
}
```

El aviso del socket **nunca lleva datos del paciente** — solo un id. El dato
real siempre se trae por el `httpResource` normal, que es el que respeta el
escopado por rol del backend. Deja un polling de respaldo mucho más largo
(60s, no 15s) como red de seguridad si el socket se cae, no como mecanismo principal.
