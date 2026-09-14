---
name: crm-conversaciones
description: Reglas de negocio, arquitectura en tiempo real, seguridad de medios y protocolo de WhatsApp Cloud API para el módulo de Conversaciones (Inbox Omnicanal). Úsalo SIEMPRE que trabajes en conversaciones.page, sus subcomponentes (lista, hilo, composer, sidebar), el servicio de estado, el WebSocket de Realtime, las plantillas de WhatsApp, la ventana de 24h, o los endpoints de mensajes y medios en el backend.
---

# Conversaciones (WhatsApp Inbox)

Este módulo gestiona la mensajería omnicanal de WhatsApp Cloud API integrada con el CRM clínico. Combina actualización en tiempo real por WebSocket, persistencia en PostgreSQL, almacenamiento privado de medios en Cloudflare R2 y control de acceso estricto por roles.

## 1. Reglas Inmutables de WhatsApp Cloud API

### La línea del chat se dice UNA vez, y en la cabecera

`.chat-header` es `flex-shrink: 0` dentro de una columna flex: **nunca se va de
pantalla**, tampoco en móvil con el teclado abierto. Ahí vive el indicador de
línea (`.crm-linea`), al lado del nombre de la paciente.

No se repite encima del compositor, y esa franja se quitó por una razón de UX
concreta: a todo el ancho, con borde superior y entre el último mensaje y la
caja de texto, **se leía como una línea más del hilo** — parecía algo escrito
por la paciente. Tampoco hacía falta: una conversación pertenece a una sola
línea (`@@unique([clienteId, lineaId])`), así que al enviar no hay ambigüedad
que resolver.

Debajo del nombre tampoco: ahí estaba en teal y con el teléfono de la línea
pegado, así que competía con la identidad de la paciente y dejaba **dos números
apilados**. El teléfono de la línea vive en el `title`; quien contesta no lo
necesita mientras lee.

Es el patrón de cualquier bandeja multicanal seria: el canal es metadato de la
conversación, va en su cabecera como marca discreta, y no se mete en el flujo de
mensajes ni se repite en cada superficie.

### Campaña de origen: qué guarda el CRM y qué ve la agente

`Cliente.datosExtra.campanaOrigen` se llena desde el `referral` del webhook de
Meta. Se lee **siempre** con `campanaOrigenDe()` (`shared/models/campana-origen.ts`),
nunca leyendo el JSON a mano: esa función estaba duplicada en el hilo y en el
panel lateral y las dos copias ya habían divergido —siete campos contra cuatro—,
así que el mismo chat mostraba distinto contexto según dónde se mirara.

**Todo campo es opcional, y no por comodidad.** Meta manda unos u otros según el
anuncio (`image_url` solo en los de imagen, `thumbnail_url` solo en los de
video, nunca `ctwa_clid` en los de Estados de WhatsApp), y los chats anteriores
al 14-09-2026 guardaron solo cuatro campos.

Lo que se captura hoy, contrastado con la referencia oficial del webhook
(*Text messages webhook reference*, actualizada el 17-jun-2026):

| Campo de Meta | Se guarda como | Para qué |
|---|---|---|
| `headline` | `titular` | Lo que prometía el anuncio |
| `body` | `cuerpo` | **Lo que la paciente leyó** antes de escribir |
| `welcome_message.text` | `saludo` | Suele ser su primer mensaje, literal |
| `image_url` ó `thumbnail_url` | `imagenUrl` | Un anuncio de VIDEO no trae `image_url`: mapear solo ése lo dejaba sin imagen |
| `media_type` | `mediaTipo` | `image` \| `video` |
| `source_id` | `anuncioId` | Analítica; se oculta en móvil |
| `source_url` | `origenUrl` | Enlace al anuncio |
| `ctwa_clid` | `clickId` | **No se muestra.** Lo pide la Conversions API para atribuir una venta a su campaña; solo llega en este webhook y no se puede reconstruir después |

⚠️ `welcome_message` no estaba en el DTO hasta el 14-09-2026, así que
`whitelist: true` lo borraba entero — el modo de fallo que documenta
`crm-backend-module`: no llega a medias, llega vacío y sin una línea de log.

**En el hilo el banner se pliega.** Antes era una franja fija y en móvil solo
cabía el titular: el cuerpo del anuncio vivía únicamente en el panel lateral,
que en el teléfono hay que abrir aparte, así que quien contestaba desde el móvil
no lo veía nunca. Cerrado ocupa lo mismo; un toque despliega imagen, cuerpo,
saludo y enlace. Las URLs de imagen de Meta **caducan**: la miniatura se oculta
sola si falla (`ocultarMiniatura`) en vez de dejar el icono roto.

### Ventana de Atención (24 Horas Orgánica / 72 Horas Meta Ads)
- **Ventana Orgánica Estándar (24 horas)**:
  - Aplica cuando el paciente escribe directamente al número de la clínica.
  - Vence a las 24 horas del último mensaje entrante del paciente.
- **Ventana Extendida de Meta Ads (72 horas / 3 días completos)**:
  - Aplica automáticamente cuando el paciente contacta desde un anuncio de Facebook/Instagram (`campanaOrigen` / `referral`).
  - Durante 72 horas, Meta permite el envío 100% gratuito de texto libre, audios, fotos y documentos sin requerir plantillas.
- **Fuera de la ventana (vencida >24h o >72h)**:
  - Meta **prohíbe** enviar mensajes de texto libre directo (error `#131047`).
  - Es **estrictamente obligatorio** utilizar una **Plantilla Aprobada de WhatsApp (HSM / Template)**.
  - El frontend bloquea de forma automática y estricta la caja de texto y despliega el selector de plantillas oficiales con sus variables obligatorias para evitar que se envíen mensajes anulados/fallidos.

**Cicatriz real (corregida):** el composer alguna vez saltaba este bloqueo si
la ventana de 72h de Meta Ads seguía activa (`ventana72hMetaActiva`), como si
esas 72h habilitaran texto libre. **No es así**: el FEP de 72h solo evita que
se COBRE una plantilla, nunca sustituye a la CSW de 24h para texto libre. El
mensaje salía "No enviado" igual, solo que más tarde y sin explicación. El
bloqueo de `fueraDeVentana24h` es incondicional; `ventana72hMetaActiva` solo se
lee para matizar el texto del aviso ("sale gratis" vs. se cobra), nunca para
decidir si se bloquea.

### Los ticks: "No enviado" y "Sin confirmar" NO son lo mismo

`estadoEnvio` tiene cinco valores y dos de ellos se parecen sin serlo:

| Estado | Cómo se pinta | Qué significa para la agente |
| --- | --- | --- |
| `ENVIADO` / `ENTREGADO` / `LEIDO` | tick, doble tick, doble tick en color | lo normal |
| `FALLIDO` | **"No enviado"**, en crítico | consta que no llegó; se puede reenviar |
| `INCIERTO` | **"Sin confirmar"**, en neutro | **no se sabe si llegó — no reenviar** |

`INCIERTO` aparece cuando se cortó la conexión con Meta mientras el mensaje ya
iba viajando. El backend no puede afirmar que falló, y **pintarlo como fallo es
lo que hace daño**: la agente lo reenvía y la paciente recibe el mensaje dos
veces. Se corrige solo cuando llega el `statuses` de Meta (minutos), así que el
tooltip dice explícitamente que espere. Nunca le pongas color de error ni lo
juntes con FALLIDO en un mismo `@case`.

**Cicatriz real (corregida):** `conversacion.model.ts` tenía
`EstadoEnvioMensaje` escrito **a mano** en vez de salir de `db-enums.ts`. Por eso
añadir `INCIERTO` al enum del backend **no rompió el build de este repo** —el
`check:tipos` no tenía nada que comparar— y el estado nuevo caía en el `@default`
de las dos plantillas que pintan ticks, mostrándose como un envío normal. Es
decir: la salvaguarda de "si el backend añade un valor a un enum, aquí el build
falla" **no cubre un tipo duplicado a mano**. Si ves una unión de literales que
huele a enum del backend, hazla salir de `db-enums.ts`.

Los dos sitios que pintan ticks son
`conversacion-thread.component.html` y `conversacion-preview.component.ts`: si
añades un estado, se tocan **los dos** o el inbox y el hilo se contradicen.

### Tratamiento Seguro de Medios (R2 Storage)
- **Las URLs de medios nunca se guardan como enlaces públicos permanentes en la base de datos.**
- En la base de datos solo reside la `mediaKey` (ej. `wa/convId/msgId.jpg` o `memoria/userId/uuid.png`).
- Al consultar una conversación, el backend resuelve la clave a una URL firmada HMAC efímera (expiración corta) mediante `aws4fetch`.
- Para descargar archivos, se utiliza el proxy del backend (`GET /conversaciones/media/descargar?key=...`), el cual valida los permisos del usuario con `puedeDescargarMedia` antes de emitir el binario con `Content-Disposition: attachment`.

## 2. Visibilidad y Seguridad por Rol

- **Administrador y Super Admin (`ADMIN` / `SUPER_ADMIN`)**:
  - Visibilidad total: ven todas las conversaciones del centro, sin asignar y asignadas a cualquier vendedora/agente.
  - Pueden reasignar conversaciones entre agentes.
- **Agente Comercial (`AGENTE`)**:
  - Visibilidad acotada: solo ve las conversaciones **asignadas a su propio ID** y las **conversaciones sin asignar** (pool general).
  - Toda consulta en el backend pasa obligatoriamente por `whereVisibilidad(soloAgenteId)`.

## 3. Arquitectura en Tiempo Real y Estado Frontend

### El listado se pagina y se filtra EN EL SERVIDOR (desde 2026-08-27)

`GET /conversaciones` devuelve `RespuestaPaginada` más los contadores de las
cuatro pestañas. Las cuatro operaciones —ordenar, filtrar por pestaña, filtrar
por agente y buscar— las resuelve Postgres.

**No lo devuelvas a memoria por hacer que una pestaña cambie "más rápido".** Así
estaba, y el precio fue este: el backend cortaba en las 500 más recientes y la
vista filtraba y buscaba sobre ese corte, así que una conversación en el puesto
501 **no aparecía al buscar a esa paciente por nombre**. La agente leía "sin
resultados" y concluía que no estaba en el sistema. Un corte se lee como un dato.

Dos piezas que sostienen esto y conviene no romper:

- **`Conversacion.esperandoRespuesta`** es la pestaña "Sin responder", y está
  desnormalizado porque "el último mensaje es ENTRANTE o automático" no se puede
  poner en un `where` de Prisma. Lo escriben las cuatro transacciones que crean
  un Mensaje. Si añades un quinto camino, escríbelo también.
- **`estaSinResponder()`** en el frontend ahora prefiere ese campo del servidor y
  solo lo deduce del último mensaje cuando no viene — el caso de una fila
  construida en memoria por el envío optimista.

### Sincronización WebSocket (`RealtimeService`)
- El canal WebSocket es la fuente primaria de eventos (`mensaje_entrante`, `mensaje_enviado`, `estado_mensaje`, `conversacion_actualizada`).
- **Un aviso refresca UNA fila, no el inbox**: `refrescarFilaPorRealtime()` pide
  `GET /conversaciones/:id/resumen` y la coloca arriba. Antes cada mensaje
  entrante recargaba las 500 conversaciones (277,7 kB) para reflejar un cambio en
  una sola; ahora son 0,6 kB. Ese endpoint recibe los filtros activos y responde
  `conversacion: null` si la conversación dejó de encajar en la pestaña —le
  contestaron y estabas en "Sin responder"—, para quitarla en vez de dejar una
  fila que ya no corresponde.
- **Actualización Atómica**: al enviar, `reconciliarEnvioLocal` actualiza la
  conversación en memoria, la reposiciona al inicio y baja el contador de "sin
  responder" sin disparar peticiones HTTP completas.
- **Polling de Respaldo**: Se mantiene un intervalo de seguridad de **60 segundos** (ver `crm-rendimiento`) por si la conexión de sockets se interrumpe temporalmente.

### Igualdad del estado remoto (F07)

`inbox` y `detalle` conservan la igualdad por referencia predeterminada de
`httpResource`. No comparar solo ID, `Conversacion.updatedAt` y cantidad de
mensajes: los acuses de entrega/lectura, la descarga de media, las URLs firmadas
y la ficha del paciente cambian sin modificar esa triple clave. En el listado
también pueden cambiar nombre, agente, último mensaje y contadores.

Cada respuesta nueva debe llegar a las señales derivadas y a la vista. El
`track` por ID de filas y mensajes conserva la identidad del DOM; no hace falta
ignorar cambios del contenido para mantener esa identidad. La regresión está
en `conversaciones-state.service.spec.ts`, con HTTP simulado y el servicio real,
incluido el resumen realtime de una fila que ya estaba primera.

### Envío Optimista (0 ms de Latencia Percibida)
- Al pulsar `Enter` o enviar, el mensaje se inserta inmediatamente en el hilo con un `idOptimista` temporal y estado `ENVIANDO`.
- Al confirmar el servidor, se reemplaza el ID provisional por el definitivo y el estado cambia a `ENVIADO` con su check.
- Si la petición falla, se restaura el estado previo (`chatPrevio`) y se notifica el error permitiendo reintentar.
- **Cuidado con la carrera WebSocket-vs-POST**: el backend llama `emitirActividad()`
  de forma síncrona en cuanto guarda el mensaje —antes de responder el POST—,
  así que el aviso de socket puede llegarle al mismo navegador que envió ANTES
  de que resuelva su propia petición. Si el `reload()` de tiempo real ya trajo
  el mensaje real cuando el POST resuelve, `reconciliarEnvioLocal` no debe
  agregarlo de nuevo: el chequeo correcto es "¿el id real ya está en el
  array?", no "busca el optimista y reemplázalo". Sin eso, algunas imágenes (y
  en teoría cualquier mensaje) se duplicaban en el hilo — no por doble clic ni
  doble envío a Meta, sino por la misma confirmación llegando dos veces.

## 4. Despiece Modular de Componentes

La vista `conversaciones` se estructura en submódulos desacoplados gobernados por `ConversacionesStateService`:

1. **`conversacion-sidebar`**: Ficha del paciente, notas médicas fijadas, edición rápida de datos y asignación.
2. **`conversacion-lista`**: Bandeja lateral izquierda, pestañas de filtrado (Todas / Sin asignar / Mis chats) y tarjetas de conversación.
3. **`conversacion-thread`**: Hilo central de mensajes, separadores de fecha, burbujas, lightbox y reproducción de audio.
4. **`conversacion-composer`**: Área de redacción, soporte de pegado (`Ctrl+V`), Drag & Drop, atajos (`/`), grabación de voz y selector de plantillas.
5. **`conversaciones.page`**: Orquestador que sincroniza rutas, modo inmersivo móvil y eventos globales.

## 5. Acuse Automático Fuera de Horario
- Si un mensaje entrante llega fuera del horario de atención comercial (`horario-atencion.ts`), el servicio `acuse-automatico.service.ts` emite una respuesta automática configurada con botones de navegación interactivos.

## Líneas y recepción (2026-09-13)

La bandeja recibe `linea` en cada conversación y filtra por `lineaId` en el servidor. `RECEPCION` solo ve las líneas de atención asignadas a su usuario; no ve rutas comerciales. Agentes también necesitan membresía de línea. Admins ven todas. Las plantillas se consultan con la línea del chat abierto. No conservar borradores, adjuntos ni respuestas HTTP de otro chat/sesión al cambiar de contexto. Reasignar cambia únicamente el chat de esa línea.

### Contrato de líneas y despliegue (14-09-2026)

El push del frontend despliega Vercel; el del backend no actualiza el VPS. Cuando el contrato cambia, desplegar y verificar backend + migración antes de publicar frontend. Publicar la UI primero causó `linea.nombre` sobre undefined y un catálogo 404.

`validar-canal.ts` valida la identidad de línea al entrar por listado, detalle, páginas adicionales y resumen realtime. No inferir ventas para respuestas sin canal. En los consumidores usar `paginaInbox()`, `detalleActual()` y `agentesActuales()`: `httpResource.value()` puede lanzar cuando el recurso tiene error, incluso con `defaultValue`. El detalle fallido muestra reintento y no permite componer. Las pruebas del state reproducen el contrato antiguo y su recuperación.
