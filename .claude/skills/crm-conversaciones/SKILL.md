---
name: crm-conversaciones
description: Reglas de negocio, arquitectura en tiempo real, seguridad de medios y protocolo de WhatsApp Cloud API para el módulo de Conversaciones (Inbox Omnicanal). Úsalo SIEMPRE que trabajes en conversaciones.page, sus subcomponentes (lista, hilo, composer, sidebar), el servicio de estado, el WebSocket de Realtime, las plantillas de WhatsApp, la ventana de 24h, o los endpoints de mensajes y medios en el backend.
---

# Conversaciones (WhatsApp Inbox)

Este módulo gestiona la mensajería omnicanal de WhatsApp Cloud API integrada con el CRM clínico. Combina actualización en tiempo real por WebSocket, persistencia en PostgreSQL, almacenamiento privado de medios en Cloudflare R2 y control de acceso estricto por roles.

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

## Referencias por tema (carga solo la que toque)

Cada archivo es una sección completa de esta skill; no hace falta leerlas todas.

- [1. Reglas Inmutables de WhatsApp Cloud API](references/reglas-inmutables-de-whatsapp-cloud-api.md) — .chat-header es flex-shrink: 0 dentro de una columna flex: nunca se va de
- [3. Arquitectura en Tiempo Real y Estado Frontend](references/arquitectura-en-tiempo-real-y-estado.md) — GET /conversaciones devuelve RespuestaPaginada más los contadores de las
- [6. Ubicación de la clínica (2026-09-25)](references/ubicacion-de-la-clinica.md) — Un solo lugar (ubicacion-clinica.ts del backend: coordenadas, dirección,
- [Líneas y recepción (2026-09-13)](references/lineas-y-recepcion.md) — La bandeja recibe linea en cada conversación y filtra por lineaId en el servidor. RECEPCION solo ve las líneas de ate…

## 4. Despiece Modular de Componentes

La vista `conversaciones` se estructura en submódulos desacoplados gobernados por `ConversacionesStateService`:

1. **`conversacion-sidebar`**: Ficha del paciente, notas médicas fijadas, edición rápida de datos y asignación.
   - **`reservas-paciente`** (`<app-reservas-paciente>`): «Próximas reservas» de la paciente en la agenda de la clínica (ScriptCase), por su teléfono, con su propia petición (`GET /agenda/reservas/conversacion/:id`). Lo ve quien ve el chat, también ventas. Si la agenda no responde lo dice en una línea con reintento; nunca rompe la ficha.
2. **`conversacion-lista`**: Bandeja lateral izquierda: alcance (línea, agente), pestañas de trabajo (Por atender / Todas / Sin asignar / Mis chats), interruptor de cerradas, buscador y tarjetas de conversación.
3. **`conversacion-thread`**: Hilo central de mensajes, separadores de fecha, burbujas, lightbox y reproducción de audio.
4. **`conversacion-composer`**: Área de redacción, soporte de pegado (`Ctrl+V`), Drag & Drop, atajos (`/`), grabación de voz y selector de plantillas.
   - **`gestion-respuestas`** (`<app-gestion-respuestas>`): el contenido del cajón «Mis respuestas rápidas» (crear, editar y borrar las respuestas personales). El compositor abre el cajón y pone el marco; el formulario nace vacío en cada apertura.
   - **`cupos-medico`** (`<app-cupos-medico>`): el contenido del cajón «Cupos de un médico». Emite el texto (`insertar`) y el compositor lo pone debajo del borrador; nace vacío en cada apertura.
5. **`conversaciones.page`**: Orquestador que sincroniza rutas, modo inmersivo móvil y eventos globales.

## 5. Acuse Automático Fuera de Horario
- Si un mensaje entrante llega fuera del horario de atención comercial (`horario-atencion.ts`), el servicio `acuse-automatico.service.ts` emite una respuesta automática configurada con botones de navegación interactivos.
