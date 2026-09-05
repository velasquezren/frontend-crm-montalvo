# Análisis de Costos de Meta para CRM a Gran Escala

Este documento detalla la estructura de costos oficiales de Meta (WhatsApp Business Platform y Lead Ads) y los costos de infraestructura asociados para operar el CRM de forma masiva y escalable.

---

## 1. Modelo de Precios de WhatsApp Business Platform (API)

A partir del **1 de julio de 2025**, Meta cambió su modelo de cobro de "Conversaciones de 24 horas" a un **modelo de cobro por mensaje individual enviado mediante plantillas (Per-Template-Message Pricing)**.

### A. Tipos de Mensajes y sus Costos

| Tipo de Mensaje | ¿Cuándo se cobra? | Costo Relativo (Latinoamérica/Perú) | Detalle del Cobro |
| :--- | :--- | :--- | :--- |
| **Marketing** | Por cada mensaje de plantilla entregado. | **El más alto** (~$0.06 - $0.07 USD por msg) | Promociones, ofertas, novedades, reactivación de leads. |
| **Utilidad (Utility)** | Por cada mensaje de plantilla entregado fuera de la ventana de servicio. | **Moderado** (~$0.03 - $0.04 USD por msg) | Confirmación de citas, alertas de pago, recibos, recordatorios automáticos. |
| **Autenticación** | Por cada mensaje de plantilla entregado. | **Bajo** (~$0.015 - $0.02 USD por msg) | Códigos de verificación (OTP) para inicio de sesión seguro. |
| **Servicio (Service)** | **Gratis** dentro de la ventana de 24 horas. | **$0.00 USD** | Respuestas libres (texto plano/multimedia) del agente hacia el cliente cuando el cliente inició el chat. |

### B. Ventanas Gratuitas (Free Windows)
* **Ventana de Servicio al Cliente (24 horas):** Si un paciente/cliente te envía un mensaje, se abre una ventana de 24 horas. Durante este tiempo, cualquier mensaje de texto libre o plantilla de utilidad que envíe tu CRM hacia ese usuario es **completamente gratuito**.
* **Punto de Entrada Gratuito (72 horas):** Si el lead llega a través de un anuncio de Facebook/Instagram del tipo "Clic a WhatsApp" (Click-to-WhatsApp Ads), todos los mensajes enviados por el CRM a ese usuario durante las siguientes 72 horas son **gratuitos**, incluso las plantillas de marketing.

### C. Descuentos por Volumen (Volume Tiers)
Meta ofrece tarifas reducidas automáticas para las categorías de **Utilidad** y **Autenticación** a medida que aumenta el volumen mensual de mensajes enviados desde tu Cuenta Comercial de WhatsApp (WABA). Estos niveles se restablecen mensualmente.

### Links Oficiales para Descarga de Tarifas:
* **Página Oficial de Precios de Meta**: [Meta for Developers - WhatsApp Pricing](https://developers.facebook.com/docs/whatsapp/pricing)
* **Tarifario en Excel (Rate Card)**: Desde la página oficial anterior, puedes descargar el archivo Excel oficial actualizado mensualmente por Meta con el costo exacto por mensaje para cada código de país del mundo (ej. +51 para Perú, +52 para México).

---

## 2. Costos de Captura de Leads (Meta Lead Ads)

El CRM Montalvo captura leads automáticamente desde los formularios de anuncios de Facebook e Instagram.

* **Costo de la API / Webhooks:** **$0.00 USD**. Meta no cobra absolutamente nada por la transmisión de datos del webhook de leads ni por usar la Graph API para descargar los detalles del lead.
* **Costo de Ad Spend (Publicidad):** Este es el costo real. Dependerá del **Costo por Lead (CPL)** de tus campañas publicitarias. En el sector de estética/clínicas en LATAM, el CPL promedio oscila entre **$0.80 USD y $3.50 USD** por lead registrado.
* **Documentación Oficial**: [Meta Lead Ads Graph API](https://developers.facebook.com/docs/marketing-api/guides/lead-ads)

---

## 3. Costos de Infraestructura y Operación del CRM a Gran Escala

Al operar a gran escala (miles de mensajes diarios y registro masivo de leads), debes considerar costos adicionales que no son cobrados por Meta, sino por tus propios proveedores de nube:

### A. Almacenamiento de Archivos Multimedia (Media Storage)
Los mensajes de WhatsApp no solo contienen texto; los pacientes envían audios, fotos y PDFs.
* **El Reto:** Meta guarda los archivos multimedia en sus servidores solo por 30 días.
* **La Solución:** Tu CRM descarga estos archivos y los guarda de forma privada en un bucket **Cloudflare R2** (compatible con S3 API vía `aws4fetch`), resolviendo claves privadas a URLs firmadas efímeras.
* **Costo Estimado:** Cloudflare R2 ofrece **0 dólares por salida de datos (Zero Egress Fees)** y un tier gratuito de 10 GB/mes. Para 100,000 fotos/audios al mes, el costo estimado oscila entre **$0.00 y $2.00 USD mensuales** (significativamente más económico que AWS S3 estándar).

### B. Base de Datos (Base de Datos Relacional)
Guardar el historial de chat de miles de pacientes genera millones de filas rápidamente.
* **El Reto:** Las consultas de búsqueda de chats deben ser rápidas.
* **Costo Estimado:** Si usas bases de datos administradas (como Supabase, Neon o AWS RDS PostgreSQL), un plan para gran escala con alta concurrencia y 10GB+ de almacenamiento te costará entre **$25 y $100 USD mensuales**.

### C. Procesamiento de Webhooks (Cómputo Backend)
Cada vez que llega un mensaje, Meta envía un webhook a tu backend NestJS. Si tienes 50 agentes chateando a la vez y miles de clientes activos, el backend recibirá cientos de peticiones por segundo.
* **Costo Estimado:** Hosting VPS (DigitalOcean, AWS EC2, Render) adecuado para soportar este flujo de eventos concurrentes: **$15 a $40 USD mensuales**.

### D. Costo de Línea Telefónica (Número de Teléfono)
Para dar de alta el número de WhatsApp Business API, necesitas una línea activa.
* Si usas una SIM física local: Costo del plan de telefonía local mensual.
* Si usas un número VoIP virtual (Twilio, Zadarma, etc.): Entre **$1 y $5 USD mensuales** por mantener el número.

---

## 4. Comparativa: Integración Directa vs. Proveedores (BSPs)

Dado que tu CRM está siendo desarrollado con integración directa a la **WhatsApp Cloud API** de Meta en el backend (NestJS), estás ahorrando mucho dinero:

| Concepto | Integración Directa (Tu CRM) | Plataformas de Terceros (Twilio / Wati / Sirena) |
| :--- | :--- | :--- |
| **Costo por Conversación / Mensaje** | Solo pagas la tarifa base directa de Meta. | Tarifa de Meta + **Markup / Comisión por mensaje** (ej. Twilio cobra +$0.005 USD por mensaje). |
| **Costo de Suscripción Mensual** | **$0.00 USD** (Es de tu propiedad). | **$30 a $250 USD mensuales** por cantidad de agentes/usuarios. |
| **Límite de Agentes** | **Ilimitado** (Tú diseñas el software para soportar los agentes que quieras). | Bloqueado por planes de pago (ej. cobro extra por cada agente adicional). |

---

## 5. Recomendaciones de Optimización de Costos

1. **Prioriza que el usuario inicie el contacto:** Configura tus anuncios de redes sociales como anuncios de "Clic a WhatsApp" (Click-to-WhatsApp). Esto te dará **72 horas de mensajes 100% gratuitos** para calificar y cerrar al lead.
2. **Utiliza plantillas de utilidad en lugar de marketing:** Si solo vas a recordar una cita o confirmar un pago, asegúrate de registrar la plantilla bajo la categoría **Utility** en Meta Developers. Ahorrarás aproximadamente un **40% a 50%** por mensaje en comparación con plantillas de Marketing.
3. **Envía mensajes dentro de las 24 horas:** Si un paciente te responde o pregunta algo, automatiza respuestas inmediatas o entrena a tus agentes para contestar rápido dentro de la ventana de servicio de 24 horas para no consumir plantillas pagadas.
4. **Políticas de retención de archivos multimedia:** Limita el tiempo que guardas imágenes pesadas en AWS S3 (ej. borrar automáticamente capturas de pantalla de hace más de 6 meses) para mantener la base de datos limpia y optimizada.
