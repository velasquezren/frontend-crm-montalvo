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

## 2. Visibilidad y Seguridad por Rol

- **Administrador y Super Admin (`ADMIN` / `SUPER_ADMIN`)**:
  - Visibilidad total: ven todas las conversaciones del centro, sin asignar y asignadas a cualquier vendedora/agente.
  - Pueden reasignar conversaciones entre agentes.
- **Agente Comercial (`AGENTE`)**:
  - Visibilidad acotada: solo ve las conversaciones **asignadas a su propio ID** y las **conversaciones sin asignar** (pool general), siempre dentro de **sus líneas**.
  - Toda consulta en el backend pasa obligatoriamente por `whereVisibilidad(soloAgenteId)`.
- **Recepción y asistente (roles operativos, `esRolOperativo`)**: ven y responden **todos** los chats de sus líneas, aunque tengan responsable. Sin alcance comercial.

**Contestar solo reclama en una línea comercial (2026-09-25).** En la comercial,
quien responde primero un chat del pool se lo queda (cartera). En una línea no
comercial —Recepción, CLIMON— la atención es compartida: contestar **no** asigna.
Antes asignaba, y toda persona de la línea sin rol operativo (una agente de
ventas con acceso a Recepción) dejaba de ver el chat. El frontend lo refleja en
`reconciliarEnvioLocal` (la fila solo pasa a quien contestó si `linea.comercial`)
y «Sin asignar» solo se pinta en líneas comerciales. Asignar a propósito sigue
existiendo (`PATCH /:id/agente`, ADMIN).

### El sello Gold en la bandeja (2026-09-30)

La fila de una paciente Gold lleva `<app-badge variant="gold" icon="star">Gold</app-badge>`
junto al nombre: es lo que deja ver, antes de abrir el chat, a quién vale la pena
atender primero. **Solo Gold**: Silver y Bronze viven en la ficha; en cada fila serían
ruido. La categoría es por valor (FileMaker + CRM) o fijada a mano por SUPER_ADMIN —ver
`crm-backend-module`, «Categoría del paciente»—, y en la ficha del chat se cambia con
`<app-categoria-paciente>`, el mismo control que en Clientes: se guarda al elegir, no
con el «Guardar» de la ficha.

**Filtro «Gold»** (2026-10-01), junto al buscador: `state.soloGold` manda
`categoria=GOLD`, y el backend lo trata como ALCANCE (`whereAlcanceInbox`): acota la
lista, las cuatro pestañas y las cerradas con sus contadores. El Dashboard enlaza
`?pestana=SIN_RESPONDER&categoria=GOLD` («N pacientes Gold esperan respuesta», solo si
hay alguna) y su número es el mismo `where`. `restablecerFiltros()` lo apaga.

### Quién atiende y de quién es la paciente (2026-09-30)

Son dos datos distintos y no se mezclan:

| Dato | Campo | Qué dice |
|---|---|---|
| Quién **atiende** el chat | `Conversacion.agenteId` → `chat.agente` | Lo que miran «Sin asignar», «Mis chats» y el filtro por agente |
| De quién **es** la paciente | `Cliente.agenteId` → `chat.cliente.agente` | Su cartera comercial. Solo en líneas comerciales |

**Un chat libre de una paciente con dueña sigue libre, a propósito.** Lo decidió el
propietario: en Ventas lo que importa es que ninguna paciente se quede sin respuesta, la
cooperación entre agentes es parte del trabajo y por eso todas las agentes de ventas son
admin. Quien conteste primero se lo queda, también si es paciente de otra.

**Cicatriz:** el backend rellenaba `agente` con la dueña cuando el chat estaba libre
(`?? cliente.agente`). La fila decía «Ana» con el chat en «Sin asignar», no salía al
filtrar por Ana, y el envío optimista (`reconciliarEnvioLocal`) veía un responsable y no
reflejaba que quien contestó se lo había quedado. Ahora `agente` es solo quien atiende, y
`duenaDelChatLibre()` da la etiqueta «Sin asignar · paciente de Ana» en la fila y en la
ficha lateral. No vuelvas a fundirlos: si un día la regla cambia a «el chat nace de la
dueña», se cambia al CREAR la conversación, no en lo que se muestra.

## 3. Arquitectura en Tiempo Real y Estado Frontend

### El listado se pagina y se filtra EN EL SERVIDOR (desde 2026-08-27)

`GET /conversaciones` devuelve `RespuestaPaginada` más los contadores de las
pestañas (`ContadoresInbox`). Las cuatro operaciones —ordenar, filtrar por pestaña, filtrar
por agente y buscar— las resuelve Postgres. **Cada contador es exactamente el total de
su pestaña con los mismos filtros** (el backend lo prueba contra Postgres). No sumes ni
restes contadores en el cliente salvo en el envío optimista (`contadoresTrasResponder`).

**Abierta / cerrada** (2026-09-30). Las cuatro pestañas de trabajo solo muestran
abiertas. `CERRADAS` es el archivo y va fuera de ellas, en el interruptor «Cerradas» de
la cabecera del inbox (`alternarCerradas`): una cerrada no es trabajo pendiente, y
mezclarla es lo que inflaba «Sin responder» a 427. Viéndolas, ninguna pestaña queda
marcada y el subtítulo dice «Cerradas · se reabren solas». Las pestañas salen de un solo
arreglo (`pestanas` en `conversacion-lista`), no de botones copiados.
- «Cerrar» en la cabecera del chat no pide confirmación, porque no se pierde nada: se
  reabre sola si la paciente escribe o si alguien le contesta. El aviso ofrece «Deshacer»
  (`cambiarEstado`).
- Con `cerradaEn`, la franja `describirCierre` dice quién la cerró (sin `cerradaPor`, fue
  por inactividad) y ofrece «Reabrir».
- `estaSinResponder()` devuelve `false` para una cerrada.
- Al buscar en «Todas» también salen cerradas, marcadas con la insignia «Cerrada».

### Atención humana: «Atención», la tarjeta y el bloque del chat (2026-10-05)

Cuando una paciente toca «Hablar con recepción», completa el Flow de cita o manda
una respuesta interactiva que hay que revisar, el **servidor** registra una
solicitud (backend: `crm-backend-module`, «Atención humana»). Aquí solo se pinta:

- **Pestaña «Atención»**, primera de la fila y **solo si hay solicitudes** (o si está
  elegida): con las interacciones apagadas no nace ninguna y una pestaña siempre
  en cero sería ruido. Su número es `esperandoHumano + enAtencion`, del servidor;
  dentro, una línea dice los dos por separado. El orden lo da el servidor (en
  espera primero, prioridad, espera más larga), así que **en esta pestaña un
  aviso en vivo recarga la lista** en vez de subir la fila al tope.
- **La tarjeta** cambia el reloj de «Sin responder» por el de la solicitud
  (`atencion.solicitadaEn`, que no se reinicia al recargar). El color sale de
  `varianteDeAtencion`: negro (`critical`) **solo** para la emergencia, primario para
  pedir una persona, `info` para lo demás; en atención, «En atención · Ana» en neutro
  (una emergencia sigue en negro hasta resolverla). **Va en su propia fila,
  entre la línea y el último mensaje**: junto al mensaje lo dejaba en tres letras
  (y lo que la paciente escribe DESPUÉS de pedir una persona es lo que hay que leer)
  y junto a la línea recortaba su nombre, que en varias líneas distingue el chat.
- **`<app-atencion-humana>`** bajo la cabecera del hilo, antes de la campaña: una
  línea con motivo y espera, o «En atención por Ana», y las acciones; el contexto
  (lo que se le ofreció, lo que eligió, los datos del Flow, su último mensaje) se
  despliega a pedido. Nunca dice «cita confirmada»: un Flow de cita es una
  solicitud.
- Las cuatro transiciones van por `state.cambiarAtencion()`. Con respuesta del servidor
  —también un 409— se vuelve a leer la fila y el detalle: «Ya la atiende Ana» tiene que
  terminar mostrando a Ana, no el botón pulsado. **Sin respuesta (sin red) NO se
  recarga el hilo**: la recarga fallaría y lo cambiaría por «No se pudieron cargar los
  mensajes»; al volver la red el socket recarga lo autoritativo.
- **Validado con un navegador real** (Chrome 151, datos sintéticos, dos sesiones): orden y
  contadores, toma simultánea y 409, liberar sin reiniciar el reloj, resolver y estado
  vacío en vivo, error de red y reconexión, 390 px sin desborde y teclado con foco
  visible. Los avisos (`<app-toast-container>`) son una región `aria-live`.
- Textos y etiquetas en `atencion-humana.ts`; **ninguna regla de negocio**: el
  estado, el motivo y la prioridad los decide el servidor.
- **Emergencia (`EMERGENCIA`, prioridad `CRITICA`, 2026-10-05)**: la declara la paciente
  desde el menú de atención o escribiendo «es una emergencia». Se distingue por **forma
  además de color** (`iconoDeAtencion`: `alert-circle`), porque el `critical` de la paleta
  es negro: badge `critical` en la tarjeta y `.crm-atencion--critica` en el bloque, que se
  mantiene también en atención hasta resolverla. Nunca un rojo nuevo.

### Pago de una promoción: `<app-pago-promocion>` bajo el bloque de atención (2026-10-06)

Cuando la paciente toca «Pagar ahora» en la tarjeta de una promoción, el detalle del chat
trae `pago` (estado, monto, promoción, comprobante) y el bloque lo pinta en una línea. Con un
comprobante por verificar: el enlace al comprobante (del hilo cargado) y **«Confirmar pago»
solo si `puedeGestionComercial`** (registra una venta; el servidor lo vuelve a exigir), «Pedir
otro» con un motivo obligatorio (lo lee la paciente) y «Anular» con `window.confirm`. Las
acciones van por `state.accionPago()`, igual que las de atención: pase lo que pase se relee el
detalle, salvo sin red. Sin pago, si llegó por el código `PRM-…`, una línea lo dice. El QR de
cada línea se configura en Líneas → «Cobro» (`cobro-linea-editor.component.ts`). Textos en
`pago-promocion.ts`; nunca «pagado» antes de que una persona lo confirme.

### Menú de atención: se configura en Líneas, no en el inbox (2026-10-05)

El menú con el que cada línea recibe a la paciente se edita en
`features/lineas-whatsapp/menu-atencion-editor.component.ts` (SUPER_ADMIN, su propio
cajón). Lo que la paciente toca llega al inbox como cualquier solicitud de arriba: no
hay vista nueva. El editor manda el menú entero (`PUT /menu-atencion/:lineaId`) y, ante
un 400, muestra **la lista de motivos del servidor**, uno por línea, sin perder lo
escrito. La opción «Promociones» no tiene lista propia: muestra las publicadas para WhatsApp
en el módulo Promociones. `menu-atencion.model.ts` solo ayuda a quien configura (límites, catálogo,
vista previa); la regla de botones-o-lista copia la del backend y, si divergen, manda el
backend. Ningún texto para la paciente tiene valor por defecto. Diseño:
`../backend-crm-montalvo/docs/menu-atencion.md`.

### La barra del inbox: de lo más amplio a lo más fino (2026-09-30)

De arriba abajo: cabecera (título, «Cerradas», «Nuevo chat») → **alcance** (línea y, para
el admin, a quién mira, lado a lado) → pestañas → buscador. Cada banda tiene contenido:
antes había una franja casi vacía solo para «Ver cerradas», otra plegable «Por agente»
y una píldora «727 chats» que repetía el contador de «Todas».

**El alcance del admin es UN valor** (`AlcanceInbox`: `'EQUIPO' | 'MIOS' | { agenteId }`,
señal `state.alcance`). Eran dos controles y los dos fallaban:

- **Se combinaban en algo sin sentido.** El botón «Todo/Míos» y los chips de agente se
  encendían a la vez: «los de Ana que además son míos o del pool» casi siempre daba vacío.
  Ahora son opciones del mismo `<app-select>` y `filtrosDeAlcance` nunca manda
  `agenteId` con `soloMios`.
- **El número no era lo que aparecía.** El filtro de agente solo valía en «Todas» y
  cambiar de pestaña lo soltaba. Pero el backend aplica el alcance a TODOS los
  contadores (`whereAlcanceInbox`): con una agente elegida, «Sin responder» contaba los
  de ella y al pulsarla la lista traía los de todo el equipo. Ahora el alcance acota todas las
  pestañas y las cerradas, igual que la línea, y nada lo suelta salvo
  `restablecerFiltros()`: la llaman los enlaces que llegan de otra pantalla (dashboard,
  agenda, ficha), porque lo que buscan tiene que verse aunque la visita anterior dejara
  la bandeja recortada.

Los chips contaban sobre la página cargada (50 filas), así que su número era orientativo.
El selector no lleva número: al elegir una agente, las pestañas ya muestran los de ella,
contados por el servidor.

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

### Envío Optimista, y por qué NO se hace rollback (R2, 2026-09-17)

- Al enviar, el mensaje entra en el hilo con un `idOptimista` y **`envioLocal:
  'ENVIANDO'`**. Ese campo es del navegador; `estadoEnvio` —el del servidor—
  queda en `null` a propósito. **Nunca pintar `ENVIADO` antes de que el servidor
  confirme**: un mensaje que se ve confirmado y no salió es la peor mentira
  posible acá.
- Al confirmar, `reconciliarEnvioLocal` sustituye el globo por el real y
  `envioLocal` desaparece; manda el `estadoEnvio` del servidor.
- **Si falla, el globo NO se borra.** Antes se restauraba `chatPrevio` y el
  mensaje se esfumaba con un toast: un mensaje que se ve salir y luego
  desaparece se lee como enviado-y-perdido. Ahora se queda marcado y ofrece
  reintentar sin reescribirlo.
- El fallo se clasifica en dos, y la diferencia importa:
  **`ERROR`** (consta que no salió: 400, 401, 403, 404, 429 — códigos que el
  backend corta antes de la transacción) y **`AMBIGUO`** (no se sabe: red caída,
  timeout, 5xx). Ver `clasificar-error-envio.ts`.

### `clientMessageId`: qué hace seguro el reintento (R2.1)

El backend persiste el mensaje y despacha a Meta **antes** de responder el POST,
así que una respuesta perdida es indistinguible de un envío que nunca ocurrió.
Reintentar sin una clave estable mandaba un segundo WhatsApp real.

- El navegador genera un **UUID por INTENCIÓN de envío** (`crypto.randomUUID()`)
  y lo reutiliza en cada reintento del mismo globo. No se regenera nunca.
- La garantía no es el código: es un **índice único de PostgreSQL** sobre
  `Mensaje.clientMessageId`. El backend traduce su rebote y devuelve la fila que
  ya existía, **antes** de emitir socket y antes de despachar a Meta.
- Por eso `AMBIGUO` **sí** se puede reintentar. Un globo sin `clientMessageId`
  —anterior a R2.1— no ofrece el botón: ahí sí duplicaría.
- La clave está **aislada por conversación**: un `clientMessageId` de otro chat
  responde 409 y no devuelve nada del original.

### Reintento con adjunto (R2.2)

- El globo conserva `mediaKey`, `mediaMime`, `mediaNombre` y `clientMessageId`,
  así que el reintento **reconstruye el adjunto y NO vuelve a subir el archivo**:
  ya está en R2 desde antes del primer POST.
- El `contenido` del globo es **exactamente** el que viajó en el POST. No caer a
  `mediaNombre` cuando no hay pie de foto: al reintentar convertiría un nombre de
  archivo en el pie real.
- Mientras el archivo sube, el compositor muestra «Subiendo archivo…» y bloquea
  el envío. Ese estado vive en el compositor y **no** en `envioLocal`, porque
  durante la subida todavía no existe mensaje: pintar una burbuja afirmaría que
  algo salió cuando aún se puede descartar.
- **Cuidado con la carrera WebSocket-vs-POST**: el backend llama `emitirActividad()`
  de forma síncrona en cuanto guarda el mensaje —antes de responder el POST—,
  así que el aviso de socket puede llegarle al mismo navegador que envió ANTES
  de que resuelva su propia petición. Si el `reload()` de tiempo real ya trajo
  el mensaje real cuando el POST resuelve, `reconciliarEnvioLocal` no debe
  agregarlo de nuevo: el chequeo correcto es "¿el id real ya está en el
  array?", no "busca el optimista y reemplázalo". Sin eso, algunas imágenes (y
  en teoría cualquier mensaje) se duplicaban en el hilo — no por doble clic ni
  doble envío a Meta, sino por la misma confirmación llegando dos veces.

### Avisar solo cuando escribió el paciente (2026-09-23)

El socket manda `conversacion:actividad` por **todo** lo que cambia un chat
—ticks de entrega, envíos propios, media que termina de subir— y, solo cuando
escribió el paciente, con `entrante: true` (`ConversacionesGateway.notificarEntrante`).
La página **solo suena y notifica con `entrante`**; lo demás refresca en
silencio. Antes notificaba todo: cada tick sonaba como «Nuevo mensaje», que es
el mismo error que el backend ya había corregido en el push.

- La notificación usa la etiqueta `chat-<id>`, **la misma del push**: el
  navegador reemplaza en vez de mostrar dos avisos del mismo mensaje. Lleva el
  nombre del paciente y `textoVistaPrevia()` del mensaje.
- Los avisos se juntan 100 ms **en un lote por conversación**. Un solo
  temporizador que se reiniciaba procesaba solo el último: si dos pacientes
  escribían casi a la vez, la fila del primero no se actualizaba.
- **Leído solo con la pestaña a la vista.** Marcarlo con la pestaña oculta le
  ponía al paciente el doble tick azul de un mensaje que nadie leyó; al volver a
  la pestaña se marca (`alVolverAlFrente`).

### Hilo y compositor: lo que hace que se sienta WhatsApp

- **Abrir un chat muestra el último mensaje, aunque haya fotos.** Las fotos
  cargan en diferido (`loading="lazy"`): empiezan a bajar DESPUÉS del salto al
  fondo y, al llegar, crecen de 0 a hasta 288 px y empujan la vista hacia
  arriba —en Safari siempre, porque no compensa ese salto—. Mientras se esté al
  fondo, cada `load`/`loadedmetadata` de imagen o video (escuchado en captura
  sobre el contenedor) vuelve a bajar. Y «bajar al abrir» (`bajarAlAbrir`)
  queda pendiente hasta que los mensajes reales están en el hilo: la vista
  provisional sin mensajes ya no gasta la marca. No quitar ninguna de las dos.
- **«↓» con contador** cuando se lee más arriba y llegan mensajes: el hilo no
  arrastra al fondo (`pegadoAlFondo`), pero tampoco calla. Cuenta lo que quedó
  detrás del último mensaje visto, no el total —cargar historial también hace
  crecer la lista, por arriba—.
- **El texto se pinta como texto.** Una URL `.jpg`/`.pdf` dentro de un mensaje
  ya no se incrusta: con los mensajes del paciente eso cargaba cualquier imagen
  de cualquier servidor en el navegador de la agente. La media viaja por `mediaKey`.
- **Atajos con «/»** (`atajos.ts`): solo cuando el mensaje entero es `/algo`;
  flechas y Enter o Tab para elegir, Escape para cerrar. Insertar una respuesta
  va **al cursor** y no reemplaza el borrador. `{{nombre}}` sin nombre real se
  quita en vez de saludar «Hola WhatsApp».
- **La caja crece con el texto** hasta su `max-height`. En el teléfono
  (`pointer: coarse`) Enter hace salto de línea y se envía con el botón.
- **Buscar dentro del chat mira TODO el historial** (`busquedaServidor`, 300 ms
  de debounce, `GET /:id/buscar-mensajes`): antes solo miraba los mensajes
  cargados y decía «0» para uno de hace un mes que existía. El contador es el
  total del servidor; saltar a una coincidencia vieja carga historial hasta
  encontrarla (`asegurarMensajeCargado`, tope de 40 páginas). El primer Enter va
  a la primera coincidencia; Shift+Enter, a la anterior.
- **Adjuntos salientes** (backend, `contenido-adjunto.ts`): el texto viaja como
  descripción de la foto o el documento —antes se perdía—, el tipo sale de
  `mediaMime` y solo JPEG/PNG salen como imagen.
- La **nota fijada** la editan solo quienes pueden editar la ficha
  (`puedeGestionComercial`): guardarla es un `PATCH /clientes`, que a recepción
  y al asistente les responde 403. La siguen viendo.

## 4. Despiece Modular de Componentes

La vista `conversaciones` se estructura en submódulos desacoplados gobernados por `ConversacionesStateService`:

1. **`conversacion-sidebar`**: Ficha del paciente, notas médicas fijadas, edición rápida de datos y asignación.
   - **`reservas-paciente`** (`<app-reservas-paciente>`): «Próximas reservas» de la paciente en la agenda de la clínica (ScriptCase), por su teléfono, con su propia petición (`GET /agenda/reservas/conversacion/:id`). Lo ve quien ve el chat, también ventas. Si la agenda no responde lo dice en una línea con reintento; nunca rompe la ficha.
2. **`conversacion-lista`**: Bandeja lateral izquierda: alcance (línea, agente), pestañas de trabajo (Todas / Sin responder / Sin asignar / Mis chats), interruptor de cerradas, buscador y tarjetas de conversación.
3. **`conversacion-thread`**: Hilo central de mensajes, separadores de fecha, burbujas, lightbox y reproducción de audio.
4. **`conversacion-composer`**: Área de redacción, soporte de pegado (`Ctrl+V`), Drag & Drop, atajos (`/`), grabación de voz y selector de plantillas.
   - **`gestion-respuestas`** (`<app-gestion-respuestas>`): el contenido del cajón «Mis respuestas rápidas» (crear, editar y borrar las respuestas personales). El compositor abre el cajón y pone el marco; el formulario nace vacío en cada apertura.
5. **`conversaciones.page`**: Orquestador que sincroniza rutas, modo inmersivo móvil y eventos globales.

## 5. Acuse Automático Fuera de Horario
- Si un mensaje entrante llega fuera del horario de atención comercial (`horario-atencion.ts`), el servicio `acuse-automatico.service.ts` emite una respuesta automática configurada con botones de navegación interactivos.

## 6. Ubicación de la clínica (2026-09-25)

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

## Líneas y recepción (2026-09-13)

La bandeja recibe `linea` en cada conversación y filtra por `lineaId` en el servidor. `RECEPCION` solo ve las líneas de atención asignadas a su usuario; no ve rutas comerciales. Agentes también necesitan membresía de línea. Admins ven todas. Las plantillas se consultan con la línea del chat abierto. No conservar borradores, adjuntos ni respuestas HTTP de otro chat/sesión al cambiar de contexto. Reasignar cambia únicamente el chat de esa línea.

### Contrato de líneas y despliegue (14-09-2026)

El push del frontend despliega Vercel; el del backend no actualiza el VPS. Cuando el contrato cambia, desplegar y verificar backend + migración antes de publicar frontend. Publicar la UI primero causó `linea.nombre` sobre undefined y un catálogo 404.

`validar-canal.ts` valida la identidad de línea al entrar por listado, detalle, páginas adicionales y resumen realtime. No inferir ventas para respuestas sin canal. En los consumidores usar `paginaInbox()`, `detalleActual()` y `agentesActuales()`: `httpResource.value()` puede lanzar cuando el recurso tiene error, incluso con `defaultValue`. El detalle fallido muestra reintento y no permite componer. Las pruebas del state reproducen el contrato antiguo y su recuperación.
