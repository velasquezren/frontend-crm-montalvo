# 1. Reglas Inmutables de WhatsApp Cloud API

> Parte de la skill `crm-conversaciones`: lee antes su [índice](../SKILL.md).

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
- **Ventana gratuita de Meta Ads (72 horas, «Free Entry Point»)**:
  - Se abre cuando el paciente llega desde un anuncio de Facebook/Instagram (`campanaOrigen` / `referral`) y la clínica responde a tiempo.
  - Durante esas 72 horas los mensajes **no se cobran**, incluidas las plantillas. **No** habilita texto libre: el texto libre sigue exigiendo la ventana de 24 horas (ver la cicatriz de abajo).
- **Fuera de la ventana de 24 horas**:
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

### Escribir primero: «Nuevo chat» y plantillas (2026-09-23)

`components/nuevo-chat/` pide línea, destino y plantilla en un mismo cajón y
los manda juntos a `POST /conversaciones/iniciar`. No existe un paso de «crear
el chat vacío y luego escribir»: un intento que fallaba a mitad dejaba fichas y
conversaciones vacías en la bandeja. El servidor comprueba todo antes de dar
de alta nada.

- **Destino**: una ficha (agente y administración buscan pacientes) o un número
  tecleado. Recepción y asistencia solo escriben el número: no tienen fichas
  comerciales. `telefonoParaEscribir()` solo sirve para el aviso «Escribir a
  +591…»; la normalización que vale es la del backend, y es la MISMA clave que
  usa el webhook, para que la respuesta del paciente caiga en ese chat.
- **Línea comercial**: escribirle a la paciente de otra agente responde 403.
- **Plantillas**: `<app-envio-plantilla>` lo comparten el compositor y «Nuevo
  chat». Enseña la burbuja tal como la leerá el paciente (`renderizarPlantilla`)
  y qué falta completar (`faltaParaEnviar`). **El texto no viaja**: lo compone el
  servidor desde la plantilla aprobada de esa línea. Antes viajaba el cuerpo sin
  sustituir y el historial guardaba «Hola {{1}}».
- Soporta variables numeradas y con nombre (`NAMED` exige `parameter_name`).
  Una plantilla con imagen de encabezado o enlace variable llega con
  `enviable: false` y su motivo: el chat no sabe rellenarla y Meta la rechazaría.
- **Una clave `clientMessageId` por apertura del cajón**: un doble clic no manda
  —ni cobra— dos plantillas.
- La burbuja de vista previa es `<app-vista-previa-plantilla>` (`components/`): la
  comparten este selector y el formulario de campañas. Vivía aquí con su CSS
  encapsulado, y la otra vista habría tenido que copiarla.

### Mensajes de campaña en el chat (2026-09-30)

Una campaña (`/campanas`, backend `modules/campanas`) deja su plantilla en el
historial de cada paciente como un mensaje **automático** (`automatico: true`,
`plantillaCategoria: 'MARKETING'`). A propósito no se comporta como una agente:
no asigna el chat, no lo reabre, no lo sube en la bandeja ni saca a nadie de «Sin
responder», y si la paciente no tenía chat en esa línea, nace cerrado. Lo que lo
pone en la bandeja es que ella responda: la ingesta lo reabre como a cualquier
otro. Si una agente ve una promoción en un chat que nadie tocó, es eso.

### Llegar al chat de una paciente desde otra pantalla

Todo enlace va con `?telefono=` (`enlaceAlChat`). Había cuatro contratos para
lo mismo y el botón «Conversación» de la ficha en Clientes mandaba `clienteId`,
que la bandeja no leía: llevaba a la bandeja sin abrir nada.

`abrirChatDePaciente()` lo resuelve **una vez**, preguntando al servidor, y
retira el parámetro de la URL: un chat → lo abre; varios (una por línea) →
deja la búsqueda para elegir; ninguno → abre «Nuevo chat» con el número puesto.
Coincidencia **exacta** de número (`resolverChatDePaciente`), nunca «contiene».

Cicatriz: el teléfono se quedaba en la URL y un efecto lo reaplicaba con cada
cambio de la bandeja, así que un mensaje en tiempo real devolvía a la agente al
chat del enlace aunque ella ya estuviera en otro. `?id=` (push, avisos) no
cambia.

### Abrir un chat con muchas fotos sin parpadeo (2026-09-23)

Eran tres causas, y ninguna era la consulta a la base:

1. **URLs firmadas distintas en cada lectura.** `R2Service.urlFirmada` fechaba
   la firma con la hora exacta, así que cada apertura —y cada recarga por un
   mensaje en tiempo real— daba a cada foto una URL nueva: el navegador no usaba
   su caché y las volvía a descargar TODAS. Ahora se firma por ventanas de una
   hora (misma clave → misma URL dentro de la hora, validez mínima intacta) y
   los archivos se suben con `Cache-Control: immutable`. La URL firmada NO puede
   fijar esa cabecera (R2 responde 501 a `response-cache-control`).
2. **Fotos sin caja reservada.** La burbuja nacía con altura 0 y crecía al
   cargar; el hilo se reacomodaba una vez por foto. `Mensaje.mediaAncho/Alto`
   se guardan al descargar (entrantes) y al subir a Mi Memoria (salientes), ya
   girados por EXIF, y `cajaImagen` reserva la caja exacta. Sin medidas (lo
   anterior), una caja fija de 240×240 recortada al centro. **No vuelvas a
   pintar una `<img>` de chat sin su caja.**
3. **Volver a un chat pasaba por el esqueleto.** `hilosRecientes` recuerda los
   últimos 12 hilos en memoria (se vacían al cambiar de sesión) y los pinta al
   instante mientras llega la versión fresca. Un error del servidor nunca
   muestra lo recordado. `detalleEsProvisional` es solo «cabecera sin hilo»;
   «lo que se ve es del servidor» es `detalleEsReal`.
