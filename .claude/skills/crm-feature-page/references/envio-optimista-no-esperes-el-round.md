# Envío optimista: no esperes el round-trip para mostrar el resultado

> Parte de la skill `crm-feature-page`: lee antes su [índice](../SKILL.md).

Si una acción del usuario tiene un resultado predecible (mandar un mensaje de
chat), actualiza el `httpResource` local con `.set(...)` **antes** de que
resuelva la petición, y revierte con el valor previo si falla:

```ts
const chatPrevio = this.detalle.value();
this.detalle.set({ ...chatPrevio, mensajes: [...chatPrevio.mensajes, mensajeOptimista] });

try {
  await this.conversacionesService.enviarMensaje(id, texto);
  this.detalle.reload(); // reconcilia con el id/timestamp real del servidor
} catch (err) {
  this.detalle.set(chatPrevio); // rollback: la burbuja optimista desaparece
  this.mensajeNuevo.set(texto); // el agente no pierde lo que escribió
}
```

Nunca lo uses para acciones cuyo resultado el servidor pueda rechazar de forma
no obvia para el usuario (crear con validación de negocio compleja, montos,
etc.) — ahí sí conviene esperar la respuesta antes de reflejar el cambio.
