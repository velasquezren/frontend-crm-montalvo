---
name: crm-conversaciones
description: Reglas de negocio, arquitectura en tiempo real, seguridad de medios y protocolo de WhatsApp Cloud API para el módulo de Conversaciones (Inbox Omnicanal). Úsalo SIEMPRE que trabajes en conversaciones.page, sus subcomponentes (lista, hilo, composer, sidebar), el servicio de estado, el WebSocket de Realtime, las plantillas de WhatsApp, la ventana de 24h, o los endpoints de mensajes y medios en el backend.
---

# Conversaciones (WhatsApp Inbox)

Este módulo gestiona la mensajería omnicanal de WhatsApp Cloud API integrada con el CRM clínico. Combina actualización en tiempo real por WebSocket, persistencia en PostgreSQL, almacenamiento privado de medios en Cloudflare R2 y control de acceso estricto por roles.

## 1. Reglas Inmutables de WhatsApp Cloud API

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

### Tratamiento Seguro de Medios (R2 Storage)
- **Las URLs de medios nunca se guardan como enlaces públicos permanentes en la base de datos.**
- En la base de datos solo reside la `mediaKey` (ej. `wa/convId/msgId.jpg` o `memoria/userId/uuid.png`).
- Al consultar una conversación, el backend resuelve la clave a una URL firmada HMAC efímera (expiración corta) mediante `aws4fetch`.
- Para descargar archivos, se utiliza el proxy del backend (`GET /conversaciones/media/descargar?key=...`), el cual valida los permisos del usuario con `puedeDescargarMedia` antes de emitir el binario con `Content-Disposition: attachment`.

## 2. Visibilidad y Seguridad por Rol

- **Super Admin (`ADMIN`)**:
  - Visibilidad total: ve todas las conversaciones del centro, sin asignar y asignadas a cualquier vendedora/agente.
  - Puede reasignar conversaciones entre agentes.
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
