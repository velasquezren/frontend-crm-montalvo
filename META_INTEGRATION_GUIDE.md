# Guía de Configuración e Integración con Meta (WhatsApp & Leads)

Para que el CRM Montalvo funcione al 100% integrando el módulo de **Conversaciones (WhatsApp Inbox Premium)** y la captura automática de **Leads desde Meta Ads**, se requiere configurar el portal de **Meta developers** y la consola de **Meta Business Manager**.

## Índice
1. [Prerrequisitos en Meta Business Suite](#1-prerrequisitos-en-meta-business-suite)
2. [Creación de la App en Meta for Developers](#2-creación-de-la-app-en-meta-for-developers)
3. [Configuración de WhatsApp Cloud API (Mensajería)](#3-configuración-de-whatsapp-cloud-api-mensajería)
4. [Configuración de Webhooks en Meta Developers](#4-configuración-de-webhooks-en-meta-developers)
5. [Configuración de Captura de Leads (Facebook/Instagram Lead Ads)](#5-configuración-de-captura-de-leads-facebookinstagram-lead-ads)
6. [Generación del Token de Acceso Permanente (System User)](#6-generación-del-token-de-acceso-permanente-system-user)
7. [Variables de Entorno para el Backend (NestJS)](#7-variables-de-entorno-para-el-backend-nestjs)

---

## 1. Prerrequisitos en Meta Business Suite

Antes de iniciar la configuración técnica, necesitas cumplir con los siguientes requisitos en [Meta Business Suite](https://business.facebook.com/):

- **Cuenta Comercial de Meta (Business Manager)** verificada (o en proceso de verificación si planeas enviar plantillas a gran escala).
- **Página de Facebook** de la clínica/empresa (asociada a tu cuenta comercial).
- **Cuenta de Instagram Profesional/Creador** vinculada a la Página de Facebook (si deseas capturar leads/mensajes desde Instagram).
- **Número de teléfono limpio**: Un número telefónico destinado a WhatsApp Business API que **no esté registrado** actualmente en ninguna app de WhatsApp (personal o business en teléfonos móviles). Si está registrado, debes dar de baja la cuenta en el celular antes de usar la API.
- **Método de pago (Línea de crédito)** configurado en el Administrador Comercial (Meta ofrece un cupo gratuito mensual de 1,000 conversaciones iniciadas por el usuario, pero requiere tarjeta de crédito para activar el servicio).

---

## 2. Creación de la App en Meta for Developers

La App en Meta actúa como el puente de comunicación entre el Backend del CRM y las APIs de Meta.

1. Ve a [Meta for Developers](https://developers.facebook.com/) e inicia sesión con tu cuenta de administrador.
2. Haz clic en **Mis apps** (My Apps) y presiona **Crear app** (Create App).
3. Selecciona el tipo de caso de uso: **Negocios** (Business) u **Otro** (Other) -> **Negocios** (Business). Esto te permitirá usar la API de WhatsApp y acceso a Leads.
4. Completa la información básica:
   - **Nombre de la app**: `CRM Montalvo` (o el nombre de tu proyecto).
   - **Correo electrónico de contacto**: El correo del administrador técnico.
   - **Cuenta comercial**: Selecciona la Cuenta Comercial de Meta que creaste en el Paso 1 (¡Crucial para heredar la verificación y métodos de pago!).
5. Haz clic en **Crear app**.

---

## 3. Configuración de WhatsApp Cloud API (Mensajería)

Este producto permite gestionar el chat multiagente del CRM recibiendo y enviando mensajes en tiempo real.

1. En el panel de control de tu App en Meta Developers, busca el producto **WhatsApp** y haz clic en **Configurar** (Setup).
2. Se te redirigirá a la pantalla de bienvenida de la API de WhatsApp.
3. **Paso temporal para pruebas**: Meta te proporcionará un número de prueba y un token temporal de 24 horas para verificar que la conexión funcione.
4. **Agregar número real**:
   - Ve a la sección **Configuración de la API** (API Setup).
   - En la parte inferior, haz clic en **Agregar número de teléfono** (Add phone number).
   - Ingresa el nombre para mostrar de tu WhatsApp, zona horaria y categoría.
   - Introduce el número de teléfono limpio, selecciona el método de verificación (SMS o llamada de voz) e introduce el código que recibas.
5. Al finalizar, copia los siguientes IDs que usará el Backend en su `.env`:
   - **Identificador de número de teléfono (Phone Number ID)**.
   - **Identificador de cuenta de WhatsApp Business (WABA ID / WhatsApp Business Account ID)**.

---

## 4. Configuración de Webhooks en Meta Developers

Los Webhooks permiten que Meta le notifique al Backend del CRM inmediatamente cuando un paciente escribe un mensaje de WhatsApp o cuando entra un nuevo Lead.

### 4.1. Configuración del Webhook de WhatsApp
1. En el panel lateral izquierdo de Meta Developers, despliega **WhatsApp** y selecciona **Configuración** (Configuration).
2. En la sección **Webhook**, haz clic en **Editar** (Edit).
3. Configura los siguientes campos:
   - **URL de devolución de llamada (Callback URL)**: La URL pública de tu backend NestJS donde escucharás los eventos de WhatsApp (ej: `https://api.montalvocrm.com/conversaciones/meta/webhook`).
   - **Token de verificación (Verify Token)**: Una clave secreta que definirás tú mismo y configurarás en el `.env` del backend (ej: `TokenSeguroMontalvoCRM2026`).
4. Haz clic en **Verificar y guardar** (Verify and Save). Meta enviará una petición de prueba para validar que tu backend responde correctamente.
5. Una vez guardado, en la misma sección busca **Campos del webhook** y haz clic en **Administrar** (Manage).
6. Suscríbete al campo **`messages`** (este campo envía notificaciones cuando llega un mensaje de texto, imagen, audio, lectura, entrega, etc.).

---

## 5. Configuración de Captura de Leads (Facebook/Instagram Lead Ads)

Si realizas campañas publicitarias con Formularios Instantáneos en Meta Ads, puedes recibirlos de forma automática en el CRM.

1. En el panel lateral de Meta Developers, haz clic en el botón `+` al lado de **Productos** y añade el producto **Webhooks**.
2. En el panel del producto Webhooks, selecciona **Page** (Página) en el menú desplegable superior.
3. Haz clic en **Suscribirse a este objeto** (Subscribe to this object).
4. Configura los datos del endpoint de tu backend NestJS destinado a los Leads:
   - **URL de devolución de llamada (Callback URL)**: `https://api.montalvocrm.com/leads/meta/webhook`
   - **Token de verificación (Verify Token)**: Tu clave secreta definida para Leads.
5. Haz clic en **Verificar y guardar**.
6. En la lista de campos, suscríbete a:
   - **`leadgen`** (Activa el webhook cada vez que un usuario completa un formulario de anuncios).

### 5.1. Permiso de Lead Access en Business Manager
Para que el CRM pueda extraer los datos personales de los leads (nombre, teléfono, correo) a través de la API, debes concederle permisos en el Business Manager:
1. Ve a **Configuración del negocio** (Business Settings) -> **Integraciones** -> **Acceso a leads** (Lead Access).
2. Selecciona la Página de Facebook donde corren tus anuncios.
3. Asegúrate de que tu App (`CRM Montalvo`) esté asignada con permisos de lectura de Leads en la pestaña **Apps**. De lo contrario, los webhooks llegarán vacíos de información o sin los datos reales de contacto.

---

## 6. Generación del Token de Acceso Permanente (System User)

Los tokens generados en el panel de desarrollador expiran en 24 horas. Para que tu CRM envíe mensajes y consulte leads continuamente, debes crear un **Usuario del Sistema** en Meta Business Suite.

1. Ve a **Configuración del negocio** de tu Administrador Comercial.
2. En el panel lateral, ve a **Usuarios** -> **Usuarios del sistema** (System Users).
3. Haz clic en **Agregar** (Add) y crea un nuevo usuario con rol de **Administrador**. Nómbralo por ejemplo `CRM System User`.
4. Selecciona el usuario creado y haz clic en **Asignar activos** (Assign Assets):
   - **Páginas**: Selecciona tu página de Facebook y activa los permisos de administración.
   - **Apps**: Selecciona tu app `CRM Montalvo` y dale control total.
   - **Cuentas de WhatsApp**: Selecciona la cuenta WABA de la clínica y dale acceso total.
5. Haz clic en **Generar nuevo token** (Generate New Token).
6. Selecciona tu App (`CRM Montalvo`) y marca **estrictamente** los siguientes permisos:
   - `whatsapp_business_messaging` (Para enviar mensajes de WhatsApp).
   - `whatsapp_business_management` (Para gestionar plantillas y números).
   - `pages_show_list` (Para leer las páginas administradas).
   - `pages_read_engagement` (Para ver interacciones).
   - `leads_retrieval` (Esencial para capturar la información del lead desde los formularios de anuncios).
7. Haz clic en **Generar token**.
8. **Copia el token generado de inmediato y guárdalo de manera segura**. No se volverá a mostrar en pantalla y es el token permanente para el backend.

---

## 7. Variables de Entorno para el Backend (NestJS)

Configura las siguientes variables en el archivo `.env` del backend NestJS para completar la conexión:

```env
# Configuración del Webhook de Meta (Tú defines estos tokens)
META_VERIFY_TOKEN="TuTokenDeVerificacionCreadoEnMetaDev"
META_LEADS_VERIFY_TOKEN="TuTokenDeVerificacionParaLeads"

# Credenciales de WhatsApp Cloud API
META_WABA_ID="123456789012345"             # Identificador de cuenta de WhatsApp Business
META_PHONE_NUMBER_ID="123456789012345"     # Identificador del número de teléfono
META_SYSTEM_USER_TOKEN="EAAG..."           # Token permanente del System User (Paso 6)

# Configuración de Aplicación Meta
META_APP_ID="123456789012345"
META_APP_SECRET="tu_meta_app_secret_aqui"
```

---

> [!IMPORTANT]
> **Modo de Desarrollo vs Modo Producción:**
> Al crear la app en Meta for Developers, esta iniciará en **Modo de desarrollo** (Development Mode). En este modo, solo los números de WhatsApp agregados a la lista de "Números de prueba" y los administradores de la app podrán recibir o enviar mensajes y simular leads. Una vez completes las pruebas y asocies el número real y método de pago, debes cambiar la app a **Modo producción** (Live Mode) en el interruptor de la barra superior del portal de Meta for Developers.
