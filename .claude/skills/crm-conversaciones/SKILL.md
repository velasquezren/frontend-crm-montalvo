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

### Sincronización WebSocket (`RealtimeService`)
- El canal WebSocket es la fuente primaria de eventos (`mensaje_entrante`, `mensaje_enviado`, `estado_mensaje`, `conversacion_actualizada`).
- **Actualización Atómica**: Al recibir un mensaje, el estado local (`ConversacionesStateService`) actualiza la conversación en memoria, la reposiciona al inicio de la lista y actualiza el contador de no leídos sin disparar peticiones HTTP completas.
- **Polling de Respaldo**: Se mantiene un intervalo de seguridad de **60 segundos** (ver `crm-rendimiento`) por si la conexión de sockets se interrumpe temporalmente.

### Envío Optimista (0 ms de Latencia Percibida)
- Al pulsar `Enter` o enviar, el mensaje se inserta inmediatamente en el hilo con un `idOptimista` temporal y estado `ENVIANDO`.
- Al confirmar el servidor, se reemplaza el ID provisional por el definitivo y el estado cambia a `ENVIADO` con su check.
- Si la petición falla, se restaura el estado previo (`chatPrevio`) y se notifica el error permitiendo reintentar.

## 4. Despiece Modular de Componentes

La vista `conversaciones` se estructura en submódulos desacoplados gobernados por `ConversacionesStateService`:

1. **`conversacion-sidebar`**: Ficha del paciente, notas médicas fijadas, edición rápida de datos y asignación.
2. **`conversacion-lista`**: Bandeja lateral izquierda, pestañas de filtrado (Todas / Sin asignar / Mis chats) y tarjetas de conversación.
3. **`conversacion-thread`**: Hilo central de mensajes, separadores de fecha, burbujas, lightbox y reproducción de audio.
4. **`conversacion-composer`**: Área de redacción, soporte de pegado (`Ctrl+V`), Drag & Drop, atajos (`/`), grabación de voz y selector de plantillas.
5. **`conversaciones.page`**: Orquestador que sincroniza rutas, modo inmersivo móvil y eventos globales.

## 5. Acuse Automático Fuera de Horario
- Si un mensaje entrante llega fuera del horario de atención comercial (`horario-atencion.ts`), el servicio `acuse-automatico.service.ts` emite una respuesta automática configurada con botones de navegación interactivos.
