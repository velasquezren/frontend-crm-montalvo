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
   - Selecciona el tipo (`LLAMADA`, `REUNION`, `TAREA`, `RECORDATORIO`).
   - Define el título, fecha y hora programada, y la duración estimada (es el alto del bloque en el calendario).
   - **El aviso no se configura.** No hay campo de anticipación: el sistema avisa solo, cuando faltan **15 minutos** para la hora programada. Es una ventana fija que vive en el backend, igual para todas las actividades y para todos los agentes. Cada actividad avisa una sola vez; si se cambia su fecha u hora, vuelve a avisar en la nueva.
   - Puede vincularla directamente a un **Prospecto (Lead)** o a un **Paciente (Cliente)** existente.
   - Si se trata de un seguimiento periódico (ej. control post-tratamiento o recordatorio de pago), activa la **Repetición** (`SEMANAL`, `QUINCENAL`, `MENSUAL`) y elige cuántas veces (2, 4, 6, 8 o 12).
4. Al concluir la actividad, el agente la marca como `COMPLETADA`. **Completar no agenda nada nuevo**: si quiere dejar cerrado el siguiente paso, usa el botón «Completar y agendar siguiente paso», que abre el formulario y solo cierra la actividad actual cuando el seguimiento ya está guardado.

### 🔁 Caso 5b: Repeticiones — qué son y qué se puede hacer con ellas

**Al crear una actividad con repetición, el sistema crea por adelantado todas
las ocurrencias elegidas**, hasta el máximo de 12. No se genera nada «más
adelante» ni «al completar»: quedan todas en el calendario desde el primer
momento.

Cada ocurrencia es una actividad de verdad: tiene su propio estado, su propio
recordatorio, y se puede completar, mover o cancelar por separado. Lo que
comparten es una **identidad de serie**, que habilita dos —y solo dos—
operaciones sobre las siguientes.

#### Cancelar: solo esta, o esta y las siguientes

Al cancelar una actividad que pertenece a una repetición, el sistema pregunta el
alcance. Una actividad suelta no pregunta nada.

**«Esta y las siguientes»** significa exactamente:

- de la misma serie;
- desde la fecha programada **actual** de la actividad elegida en adelante;
- solo las que sigan `PENDIENTE`;
- solo las que estén dentro del alcance autorizado de quien cancela.

**No** significa toda la serie histórica, ni toca las ya completadas, ni las ya
canceladas. Al terminar, el sistema dice cuántas actividades cambió de verdad.

#### Editar: solo se puede propagar la HORA

**No existe un editor de la serie completa.** La única edición colectiva que
soporta el sistema es *cambiar la hora de esta actividad y las siguientes*, y
**cada ocurrencia conserva su propio día**. Por ejemplo, una serie así:

| Antes | Después de cambiar las futuras a 10:30 |
| --- | --- |
| lunes 09:00 | lunes **10:30** |
| lunes 09:00 | lunes **10:30** |
| martes 14:00 | martes **10:30** |
| lunes 09:00 | lunes **10:30** |

El día no se toca nunca: el martes sigue siendo martes.

#### Cuándo aparece la opción «Esta y las siguientes» al editar

Solo cuando el cambio es **únicamente de hora**. Si en el mismo guardado cambia
además la fecha o el día, el título, las notas, el tipo, la duración, el
paciente o el lead, la edición se aplica **solo a esa actividad**.

Es una regla deliberada, no una carencia: un mismo «Guardar» no puede ser dos
intenciones a la vez. Propagar una hora nueva y, de paso, escribir en las
siguientes unas notas que solo valen para esta sería cambiar cosas que nadie
pidió cambiar.

Para mover una actividad de día se edita esa actividad, y solo esa.

#### Eliminar afecta siempre a una sola actividad

No existe «eliminar esta y las siguientes» ni «eliminar toda la serie». Para
detener los seguimientos futuros se usa **cancelar**, no eliminar.

La diferencia importa:

| | Qué es |
| --- | --- |
| **Cancelar** | Un hecho de negocio: la actividad se queda en el registro con estado `CANCELADA` y se puede consultar después. |
| **Eliminar** | Un borrado físico de **una** actividad. No deja rastro y no se puede deshacer. |

#### Repeticiones creadas antes de esta versión

Las repeticiones que se agendaron **antes** de que existiera la identidad de
serie no la tienen, y **no se les asignó de forma retroactiva**: no hubo ninguna
conversión de datos antiguos. Se comportan como actividades individuales —no
muestran etiqueta de repetición ni ofrecen el selector de alcance—, y se
cancelan o se mueven una por una.

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
# Modales, agenda y conversaciones — septiembre de 2026

Los formularios cortos se ajustan al contenido en escritorio. En móvil ocupan
la pantalla y permiten desplazar el contenido manteniendo accesible el cierre
y, en formularios, las acciones del pie. Las fichas extensas de Servicios
conservan su distribución amplia.

El calendario de Actividades muestra tareas y seguimientos comerciales en hora
de Bolivia. No sustituye una agenda médica. Desde una actividad, **Ver
conversación** abre la búsqueda del paciente entre los chats que tienes permiso
para consultar. Si tiene varias conversaciones, elige la línea correspondiente.

Agendar una actividad es un recordatorio interno: no programa envíos de WhatsApp
ni genera cargos de mensajería. Para enviar una plantilla, revisa el destinatario,
el contenido y sus variables; el botón **Confirmar y enviar** realiza el envío.
El CRM avisa de posibles cargos y no muestra un precio que no puede verificar.
Consulta las [tarifas oficiales de WhatsApp](https://business.whatsapp.com/products/platform-pricing).

**Actualizar desde Meta** vuelve a consultar las plantillas aprobadas de la
línea. Un fallo de conexión se muestra como error, distinto de no tener plantillas
aprobadas. Los mensajes rechazados muestran el código y una explicación de la
causa; los rechazos permanentes no se reintentan automáticamente.
