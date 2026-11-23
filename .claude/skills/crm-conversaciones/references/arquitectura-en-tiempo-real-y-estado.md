# 3. Arquitectura en Tiempo Real y Estado Frontend

> Parte de la skill `crm-conversaciones`: lee antes su [índice](../SKILL.md).

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

**Promoción con servicios (2026-10-12):** si el pago es de un servicio, `pago.concepto` dice
cuál («Octubre Rosa · Ecografía Mamaria») y el bloque lo muestra en vez del título: es lo que
quien verifica compara con el monto del comprobante. Los servicios se editan en la ficha de la
promoción («Servicios incluidos», `serviciosDeFilas` en `promocion.model.ts`).

### Asistente de IA en el chat (2026-10-10)

Backend: `../backend-crm-montalvo/docs/asistente-ia.md`. Aquí solo se pinta:

- **`<app-sugerencia-asistente>`** encima del compositor (modo SUGERIR): el borrador, su
  aviso («Consulta médica: …») y sus acciones. **«Usar y revisar» lo lleva a la caja y NO
  lo envía** (`state.usarSugerencia`, debajo de lo ya escrito, nunca lo pisa): la agente
  lo manda como suyo. Las acciones (tarjeta de promoción, horario) salen al pulsarlas por
  `state.enviarAccionSugerida`. Sin texto y con aviso, el asistente no redactó nada a
  propósito: no se ofrece «Usar».
- **El hilo rotula `asistente`** con el ícono `bot`, en lugar de «automático».
- **«Médico»** (`chat.medico`, 13/10): si quien escribe es un médico autorizado a consultar su
  agenda (Directorio → médico → «WhatsApp»), la fila de la bandeja y la cabecera del chat lo
  rotulan, en lugar del sello Gold: no es una paciente ni una venta. Lo calcula el backend
  (`medicos-en-chat.ts`); aquí solo se pinta. Su chat sale de «Sin responder» cuando el
  asistente le sirvió lo que pidió, y no se pausa al derivarlo (backend).
- **La nota de voz escuchada** (`mensaje.transcripcion`, 12/10): debajo del reproductor, en
  cursiva y con el ícono `bot`, lo que el asistente entendió. Solo existe en líneas con
  asistente y solo de las que se escucharon; es automática, así que se lee como ayuda, no
  como cita textual. El backend la guarda una vez (`EscuchaAudiosService`).
- **`pago.lectura`** en `<app-pago-promocion>`: «Coincide con lo esperado» / «Hay algo que
  revisar», cada verificación con forma propia (`ICONO_VERIFICACION`) y la nota de compararla
  con la imagen. Nunca dice «pagado»: coincide no es confirmado.
- Se configura en Líneas → «Asistente» (`asistente-linea-editor.component.ts`, SUPER_ADMIN):
  «Responder solo» no se guarda sin el criterio de la clínica (`motivoParaNoGuardar`, espejo
  del backend). Textos en `asistente-chat.ts` y `asistente-linea.model.ts`.

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

> **14/10/2026: retirados los botones «Sin responder» y «Gold» de la bandeja.**
> Se conservan los filtros del servidor para los accesos del dashboard
> (`state.soloSinResponder`, `state.soloGold`): `SIN_RESPONDER` se traduce a
> «Todas» con pendientes. Al entrar filtrado se muestra el alcance bajo el
> buscador con «Quitar filtros», también cuando hay resultados. No queda una
> fila vacía ni controles para activar esos filtros en la bandeja.
>
> **Cambiar de pestaña no vacía nada**: con `defaultValue`, `httpResource` deja
> `hasValue()` en verdadero mientras carga y el valor en el vacío, así que se mira
> `status() === 'loading'` (`cargandoVista`). Mientras tanto `paginaInbox` muestra la
> vista ya vista (`vistasRecientes`, 10, por `claveDeVista`) o la anterior atenuada
> (`listaDesactualizada`) con una barra fina arriba; los contadores no caen a 0 ni
> «Atención» desaparece. Pasar el mouse, enfocar o tocar una pestaña la precarga
> (`state.precargar`). Con otra vista en camino, el tiempo real y el envío optimista
> **no escriben** el recurso: `inbox.set()` cancelaría la petición en curso.

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
- **Lo que depende del paso del tiempo lee `state.ahora()`, nunca `Date.now()`.**
  Un `computed` sobre `Date.now()` no se recalcula jamás: con el chat abierto
  mientras se cumplían las 24 h, `fueraDeVentana24h` seguía en `false`, la agente
  escribía y el envío rebotaba (corregido 2026-10-09). `ahora` avanza cada minuto
  con el latido de `conversaciones.page.ts` y al volver a la pestaña; la ventana
  de 24 h, la de 72 h, los «14 min» de la bandeja y la espera de «Atención» lo
  leen. Lo que solo cambia por día (los separadores «Hoy»/«Ayer» del hilo,
  `etiquetaDeDia`) cuelga de `hoy`, que deriva de `ahora` pero cambia una vez al día.
- **«Reenviar» un mensaje «No enviado»** (`POST /:id/mensajes/:mensajeId/reenviar`,
  backend `reenvio-manual.ts`): para cuando Meta lo rechazó por algo que la clínica
  ya resolvió —la cuenta impaga (131042), la red—. Es la MISMA fila, que pasa a
  «Sin confirmar» y recibe el tick por el socket. No se ofrece en plantillas,
  automáticos, ofertas interactivas, fuera de las 24 h, ni con los rechazos que
  reenviar no arregla (131050, 130497, 131026): `sePuedeReenviar` es espejo de
  `motivoParaNoReenviar`, y manda el backend. La reclamación exige el
  `intentosEnvio` leído: así ni dos toques ni el barrido de reintentos lo mandan dos veces.
- **«Cupos»** (18/10/2026), segundo botón de la barra, tras «Ubicación»: un cajón
  (`components/cupos-medico/`) busca un médico activo (`/agenda/medicos`: nombre, código o
  especialidad) y muestra sus días y horas libres, con el primer día ya elegido.
  - Las horas son las de la web, el Flow y el asistente (`/publico/agenda/dias` y
    `/disponibilidad`, declaradas en `AgendaMedicosService`): no hay regla de disponibilidad
    propia del CRM ni ruta duplicada.
  - El texto (`textoDeCupos` en `cupos-medico.ts`, de usted) va **debajo de lo escrito y no
    se envía**. No reserva: ofrece y pregunta. Al «Actualizar», una hora que se ocupó sale
    también del texto (`soloHorasLibres`).
  - Sin horario es «a solicitud» y no se piden días; un fallo de la agenda ofrece
    «Reintentar», nunca «sin cupos»; fuera de las 24 h se desactiva como «Ubicación».
  - En móvil se oculta la etiqueta «Mis respuestas:» para que «Cupos» no quede cortado.

### Bandeja e hilo como WhatsApp (14/10/2026)

Funciones puras en `presentacion-chat.ts` (probadas en su `.spec`); la vista solo pinta:

- **Quién escribió** (`Mensaje.autor`, backend `autorId`): lo guardan `crearMensajeSaliente`
  (texto, adjunto, ubicación, interacción) y `registrarPlantilla`; lo traen el detalle y el
  historial. El hilo firma con el primer nombre (`firmaDeAutor`) **solo lo de OTRA persona**,
  arriba del primer globo de la tanda: en un chat de una sola agente no aparece nada, en
  Recepción se ve quién dijo qué. Lo automático, el asistente y lo anterior al 14/10 no tienen
  autor. El globo optimista lo firma `state.autorPropio()` y la reconciliación lo conserva
  (la respuesta del POST trae `autorId`, no el nombre).
- **Tandas** (`DiaHilo.mensajes[].continua`, `continuaTanda`): misma voz —paciente, una persona
  concreta, asistente o CRM— y < 5 min ⇒ 2 px de separación y esquina compartida; un día
  nuevo empieza tanda. El espaciado vive en `.bubble-row` (margen), no en el `gap` del hilo.
- **La fecha queda fija solo dentro de su día**: `mensajesPorDia` agrupa los mensajes en
  `DiaHilo`, cada uno con su `<section class="message-day">`. `.date-separator` es
  `sticky` dentro de esa sección, sin eventos de puntero. No poner todas las fechas
  como hermanas sticky del historial: se apilan al fondo y una etiqueta corta («Ayer»)
  deja ver las anteriores a sus lados. La clave del grupo es el día local, no su etiqueta,
  para conservar el DOM al pasar de «Hoy» a «Ayer» y al cargar historial anterior.
- **Hora de la fila** (`horaDeFila`): «10:42» hoy, «Ayer», el día de la semana y luego
  «30/09/26», por días de calendario. Era «3h» y repetía el reloj de espera de al lado.
  El `title` da la fecha completa.
- **Sin leer**: nombre y hora en negrita/primario, número lleno, último mensaje en oscuro
  (`.chat-item-no-leido`, `[destacado]` del preview). Si lo último lo contestó la IA, el
  preview lleva el ícono `bot`.
- **Borradores por chat** (`state.borradores`, en memoria): un efecto del SERVICIO guarda lo
  escrito al salir de un chat y lo devuelve al volver; la bandeja lo muestra como
  «Borrador:» (`state.borradorDe`, nunca el del chat abierto). Se vacía al cambiar de sesión
  y nunca pasa de un chat a otro. El compositor ya no vacía la caja al cambiar de chat, y
  `cambiarLinea` tampoco: lo hace el efecto, sin depender del orden de los efectos.
- **Teclado**: «/» fuera de un campo de texto lleva al buscador (Escape lo vacía); Alt+↑/↓
  abre el chat anterior/siguiente; ↑/↓ con el foco en la lista va de fila en fila. Nada de
  esto actúa dentro de un campo: ahí «/» son las respuestas rápidas y Alt+flecha mueve el
  cursor (macOS).
- **Paginación al bajar**: a 240 px del final se pide la página siguiente; «Cargar más» queda
  de respaldo.
- **«Sin resultados» dice qué filtra** (`filtrosPuestos`: búsqueda, Sin responder, Gold, línea,
  alcance) y ofrece «Quitar filtros» (`restablecerFiltros` con la pestaña actual).
- Quien no es admin lee su alcance en el subtítulo de la cabecera («Tus chats y los sin
  asignar» / «Todos los chats de tus líneas»); era una banda fija de dos líneas.
- **Adjuntos**: `motivoParaRechazarAdjunto` vale para arrastrar, elegir y pegar. Antes solo
  arrastrar validaba, y elegir un HEIC o un PDF de 12 MB lo subía y rebotaba al enviar.
- **Varias fotos o PDF a la vez** (18/11/2026): elegir (`multiple`), arrastrar y pegar
  aceptan varios, hasta `MAXIMO_ADJUNTOS` (10) por envío. La bandeja (`adjuntos`) guarda
  el ORDEN de selección: cada archivo ocupa su lugar al instante —con su miniatura local—
  y suben de a 3; quitar uno mientras sube no lo devuelve al terminar. Al confirmar,
  `planDeEnvio` hace **un mensaje por archivo** con el texto como pie del primero; los
  globos se pintan juntos y los POST salen **de a uno**. Si uno falla, los siguientes no
  se piden (llegarían desordenados) y quedan `ERROR`, reintentables sin riesgo. En el
  backend, `enOrdenPorChat` encola los despachos a Meta de un mismo chat: sin eso, la
  foto grande salía después de la chica aunque se mandara antes. Cada archivo sigue
  subiendo por `/memoria-agente/upload` (lo ya enviado no cuenta en la cuota).
