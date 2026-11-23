# Una ficha que editan varias personas: versión y solo lo que cambió

> Parte de la skill `crm-feature-page`: lee antes su [índice](../SKILL.md).

Promociones y el Directorio médico se editan desde varias sesiones a la vez (dos
agentes en la misma promoción, un admin corrigiendo un horario). El backend tiene
bloqueo optimista: cada PATCH lleva la `version` que se leyó y, si otra persona
guardó entretanto, responde **409**. Del lado del frontend son tres reglas:

- **El formulario es un `linkedSignal` del detalle**: cada versión guardada lo
  reinicia sola. Tras guardar se hace `detalle.set(respuesta)` —la respuesta ya es
  la ficha entera—, no otro GET.
- **Solo viaja lo que se tocó** (`cambiosDe` en `promocion.model.ts`): mandar el
  formulario entero pisaría campos que otra persona cambió y que esta no miraba.
- **Un 409 no descarta lo tecleado**: se avisa y se ofrece «Recargar y perder los
  míos». Lo prueban `promocion-ficha.component.spec.ts` (PATCH con solo el campo
  tocado más la versión; el 409) y `agenda-medico-ficha.component.spec.ts` (la grilla
  de horario de un médico de la agenda: el PUT exacto y el 409).

Las acciones del ciclo de vida (enviar, publicar, devolver…) y si se puede editar
las dice el **servidor** en cada respuesta (`acciones`, `puedeEditar`,
`faltantes`): la ficha no deduce permisos del rol, pinta lo que le dicen.
