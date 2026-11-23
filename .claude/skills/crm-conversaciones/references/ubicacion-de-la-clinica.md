# 6. Ubicación de la clínica (2026-09-25)

> Parte de la skill `crm-conversaciones`: lee antes su [índice](../SKILL.md).

Un solo lugar (`ubicacion-clinica.ts` del backend: coordenadas, dirección,
enlace de Maps) y dos caminos que mandan el **pin nativo** de WhatsApp —la
tarjeta con mapa que abre Maps/Waze—. Si Meta rechaza el pin, sale el enlace
como texto; el historial del CRM guarda ese texto (`CONTENIDO_PIN`).

- **Automático**: si el mensaje entrante pregunta dónde queda la clínica
  (`preguntaPorUbicacion`, conservadora a propósito: «¿dónde están mis
  resultados?» no dispara), en cualquier línea. Es `automatico: true`, así que
  **no** saca el chat de «Sin responder». No se repite en 12 h, no interrumpe si
  una persona escribió en los últimos 15 min, y corre DESPUÉS del acuse para no
  taparlo. `UBICACION_AUTOMATICA=off` lo apaga.
- **Botón «Ubicación»**: primer elemento de la barra de respuestas rápidas del
  compositor, un `<app-button variant="secondary" size="xs">` (no un botón a
  mano: el átomo ya trae carga y deshabilitado). Un clic, sin cajón, `POST
  /:id/ubicacion`. Es un envío de una persona: **sí** cuenta como respuesta y
  reclama igual que un texto. Deshabilitado fuera de la ventana de 24 h (un pin
  no es plantilla). Una clave `clientMessageId` **por chat**, que solo se
  renueva tras un envío correcto.

**Un candado por conversación para todos los automáticos** (acuse, pedido de
datos, ubicación): `guardarMensajeAutomatico` pregunta «¿ya se mandó?» y guarda
dentro de una transacción con `pg_advisory_xact_lock`. Antes era «leer y luego
escribir», y Meta entrega en paralelo: tres mensajes simultáneos daban dos o
tres acuses o mapas. Fijado en `conversaciones.integracion.spec.ts` con
`Promise.all`; sin el candado, esas pruebas fallan.
