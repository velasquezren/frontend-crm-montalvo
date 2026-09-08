# 📘 Manual Operativo y Guía de Uso — CRM Clínica Montalvo

Bienvenido al manual operativo oficial del **CRM de Clínica Montalvo**. Este documento detalla la filosofía de uso, las capacidades y restricciones por rol (**Administrador** vs **Agente**), los casos de uso principales y la normativa sobre la atención a pacientes.

---

## 🎯 1. Propósito del Sistema y Filosofía Operativa

### ¿Para qué sirve este CRM?
El CRM de Clínica Montalvo es una plataforma web centralizada diseñada para:
1. **Centralizar la atención al paciente**: Administrar la comunicación por WhatsApp de la clínica desde una única plataforma multiagente.
2. **Organizar el embudo de ventas y citas**: Registrar leads (prospectos) que llegan por redes sociales o presencialmente, convertirlos en pacientes y darles seguimiento.
3. **Control de ventas y comisiones**: Registrar los servicios médicos y estéticos vendidos, calculando automáticamente las comisiones correspondientes a cada agente.
4. **Supervisión operativa (Admin)**: Permitir a la administración monitorear el desempeño del equipo, reasignar chats y auditar la calidad de atención.

---

## 📱 2. Regla de Oro: ¿Teléfono Personal vs. App Web?

> [!CRITICAL]
> **PROHIBIDO EL USO DE TELÉFONOS PERSONALES PARA ATENDER PACIENTES**

### ❌ ¿Por qué NO usar teléfonos móviles personales?
- **Pérdida de trazabilidad**: Si un agente responde desde su teléfono personal, la clínica pierde el historial del paciente, los presupuestos dados y las notas médicas/comerciales.
- **Riesgo de fuga de clientes**: Si el agente deja la clínica, los contactos y conversaciones se van con él.
- **Falta de coordinación multiagente**: Un número de WhatsApp normal solo puede ser usado por una persona a la vez.

### ✅ ¿Cómo funciona la plataforma?
- La clínica utiliza la **WhatsApp Cloud API (Meta)** vinculada al número oficial de la Clínica Montalvo.
- **Todos los agentes operan desde la App Web del CRM** en sus computadoras o tablets.
- Varios agentes pueden responder simultáneamente al mismo número oficial sin interferir entre sí.
- Cada mensaje queda registrado con hora, fecha y nombre del agente que respondió.

---

## 👥 3. Perfiles de Usuario: Agente, Administrador y Super Admin

### 🛡️ Matriz de Permisos y Capacidades

| Funcionalidad / Módulo | Agente (`AGENTE`) | Administrador (`ADMIN`) | Super Admin (`SUPER_ADMIN`) |
| :--- | :---: | :---: | :---: |
| **Acceso al Dashboard** | Métricas personales | Métricas avanzadas globales | Métricas avanzadas globales |
| **Directorio de Clientes** | Consultar e ingresar | Consultar, ingresar y editar | Control total de fichas y cruces |
| **Gestión de Leads** | Sus leads + sin asignar | Gestionar y reasignar todos | Control total y auditoría |
| **Inbox WhatsApp (Chats)** | Mis chats + sin asignar | Visibilidad y reasignación total | Visibilidad y reasignación total |
| **Agenda de Actividades (`/actividades`)** | Sus tareas, llamadas y citas | Agenda global de toda la clínica | Agenda global y filtros por agente |
| **Registro de Ventas** | Registrar ventas propias | Registrar, auditar y anular | Registrar, auditar y anular |
| **Módulo de Comisiones (`/finanzas`)** | Consultar sus comisiones | Liquidar y auditar reportes | Modificar reglas, exclusiones y cerrar |
| **Gestión de Agentes/Usuarios** | ❌ No permitido | ❌ No permitido | ✅ Crear, desactivar y editar usuarios |

---

## 💼 4. Casos de Uso Principales (Paso a Paso)

### 📲 Caso 1: Atención de un mensaje nuevo en WhatsApp
1. El paciente envía un mensaje al número de WhatsApp de Clínica Montalvo.
2. El sistema lo registra automáticamente e ingresa el chat en la pestaña **"Sin asignar"**.
3. **El Agente** o **Admin** ve el indicador (punto verde teal) de chat nuevo sin atender.
4. Al abrir el chat y responder, el sistema asigna la conversación o el **Admin** la asigna manualmente.
5. El chat pasa a la pestaña **"Mis chats"** del agente asignado.

### 📝 Caso 2: Registro de un paciente presencial en recepción
1. Un cliente llega a recepción sin cita previa o a consultar precios.
2. El agente ingresa al menú flotante **FAB (+)** → **"Registro Presencial"** (o módulo Leads).
3. Completa los datos básicos: Nombre, Teléfono, Canal de Origen (Presencial/Instagram/Facebook), Servicio de Interés.
4. El sistema crea la ficha del paciente y la categoriza como `PROSPECTO`.

### 💳 Caso 3: Registro de una venta y cálculo de comisión
1. Tras realizarse la atención o tratamiento, el agente va a **"Ventas"** → **"Registrar Venta"**.
2. Selecciona al paciente, el tratamiento/servicio y el monto cobrado.
3. Al guardar, la venta impacta en los reportes diarios y el sistema calcula automáticamente el porcentaje de comisión para el agente en el módulo **Comisiones**.

### 🔄 Caso 4: Reasignación de chat por cambio de turno (Solo Admin)
1. El Administrador ingresa a **WhatsApp Inbox**.
2. En la lista o usando el filtro por agente, selecciona la conversación activa.
3. En la ficha derecha del paciente, hace clic en **"Reasignar"**.
4. Selecciona el nuevo agente del dropdown. La conversación pasa inmediatamente a la bandeja del nuevo agente con todo el historial de chat intacto.

### 📅 Caso 5: Agendamiento y control en la Agenda de Actividades (`/actividades`)
1. El agente ingresa al módulo **Actividades** desde el menú lateral (`📅`).
2. Puede visualizar la agenda en formato **Día**, **Semana**, **Mes** o **Lista**.
3. Al pulsar **"Nueva Actividad"**:
   - Selecciona el tipo (`LLAMADA`, `WHATSAPP`, `CITA`, `SEGUIMIENTO`, `TAREA`).
   - Define el título, fecha y hora programada, duración real estimada y anticipación del recordatorio.
   - Puede vincularla directamente a un **Prospecto (Lead)** o a un **Paciente (Cliente)** existente.
   - Si se trata de un seguimiento periódico (ej. control post-tratamiento o recordatorio de pago), activa la **Repetición** (`DIARIA`, `SEMANAL`, `MENSUAL`).
4. Al concluir la actividad, el agente la marca como `COMPLETADA`. Si tenía repetición programada, el sistema agenda en automático la siguiente cita/tarea en el calendario.

### ⚡ Caso 6: Actividad Rápida desde el chat de WhatsApp
1. Mientras chatea con una paciente en **Conversaciones**, el agente acuerda llamarla o agendar una cita.
2. Sin salir de la conversación, en el panel lateral derecho (Ficha del Contacto) presiona **"Agendar Actividad"**.
3. El sistema precarga los datos del contacto automáticamente.
4. El agente define la fecha, tipo y notas, y guarda. La actividad queda inmediatamente vinculada al historial del paciente y visible en el calendario general.

### 🔔 Caso 7: Recordatorios en vivo desde la Campana del Topbar
1. En la barra superior, la campana (`🔔`) muestra un contador dinámico en rojo con las actividades vencidas o pendientes para el día de hoy.
2. Al hacer clic en la campana, se despliega el panel de **Notificaciones & Recordatorios**.
3. El agente puede revisar las tareas prioritarias y marcarlas como completadas directamente con un solo clic sin necesidad de desplazarse a otra pantalla.
4. Cuando se cumple la hora de un recordatorio, el backend emite una alerta instantánea en vivo por WebSocket que actualiza la campana al segundo.

---

## 🚫 5. Lo que NO se debe hacer (Restricciones y Buenas Prácticas)

1. **NO compartir credenciales**: Cada agente debe usar su propia cuenta. El historial de mensajes, las actividades agendadas y las comisiones están ligados estrictamente al usuario autenticado.
2. **NO dejar chats en "Sin asignar" por más de 15 minutos**: Los chats sin atender afectan la tasa de conversión y la imagen de la clínica.
3. **NO registrar números sin código de país**: Los teléfonos para WhatsApp deben registrarse siempre en formato internacional (ej. `+591...`).
4. **NO deshabilitar las notificaciones del navegador ni del móvil**: El CRM opera con **WebSockets en tiempo real** y notificaciones **Push PWA (VAPID)**. Mantener la sesión activa y permitir notificaciones asegura recibir alertas instantáneas cuando una paciente escribe o un recordatorio de cita vence.

---

## 🖥️ 6. Resumen de Navegación en la App Web

```
 ┌─────────────────────────────────────────────────────────────────────────────┐
 │ Topbar: Logo Clínica Montalvo CRM │ 🔔 Recordatorios │ Usuario │ Salir      │
 ├───────────┬─────────────────────────────────────────────────────────────────┤
 │ Icon-Rail │ WORKSPACE                                                       │
 │ ───────── │ ─────────                                                       │
 │ 📊 Dash   │ 📥 Inbox WhatsApp (Filtros: Todas | Sin Asignar | Mis Chats)    │
 │ 👥 Clientes│   ├── Panel 1: Lista filtrable de conversaciones               │
 │ 👤 Leads  │   ├── Panel 2: Hilo de mensajes + Auto-scroll + Envío           │
 │ 💬 Chat   │   └── Panel 3: Ficha paciente + Asignar + ⚡ Actividad Rápida   │
 │ 📅 Activ  │                                                                 │
 │ 🛍️ Ventas │ 📅 Módulo Actividades: Calendario Schedule-X (Día/Sem/Mes/Lista)│
 │ 💰 Finanzas│ 🔘 FAB Flotante: Acciones Rápidas (Registrar Venta, Lead)       │
 └───────────┴─────────────────────────────────────────────────────────────────┘
```
