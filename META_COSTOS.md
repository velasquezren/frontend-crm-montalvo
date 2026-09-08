# Costos de Meta — WhatsApp y Lead Ads (Bolivia, +591)

Estructura de costos oficiales de Meta (WhatsApp Business Platform y Lead Ads) en
**Bolivianos (BOB)** y **Dólares (USD)** para operar el CRM a escala en Bolivia.

> Consolida `META_COSTS_BOLIVIA.md` y `META_COSTS_ANALYSIS.md`, que decían lo
> mismo con dos monedas distintas. Bolivia es el caso operativo real; del
> documento general se conservan las partes que no estaban aquí —descuentos por
> volumen, enlaces al tarifario oficial y el detalle de infraestructura—.
>
> **Las tarifas son de septiembre de 2026 y Meta las revisa.** Antes de
> presupuestar, bajar el Excel oficial del enlace de la sección 8.

---

## 1. Tasas de Cambio Utilizadas para la Conversión
Para que tu planificación financiera sea realista, calculamos los costos bajo dos escenarios de tipo de cambio en Bolivia:
1. **Tipo de Cambio Oficial (BCB):** **1 USD = 6.96 BOB**
2. **Tipo de Cambio Paralelo / Mercado Real (Estimado):** **1 USD = 10.00 BOB** (Este valor fluctúa y debes adaptarlo según la cotización real de tus tarjetas o transferencias para pagos al exterior).

---

## 2. Precios por Mensaje de WhatsApp Business API en Bolivia (+591)

Meta cobra en base a la **plantilla entregada (Per-Message pricing)** según la categoría y el país del destinatario. 

*Bolivia está agrupada bajo la categoría de tarifas **"Resto de Latinoamérica"** de Meta.*

### A. Estructura de Costos por Categoría

| Categoría de Mensaje | Costo en USD | Costo en BOB (Oficial: 6.96) | Costo en BOB (Paralelo: 10.00) | Uso en tu CRM |
| :--- | :--- | :--- | :--- | :--- |
| **Marketing** | ~$0.055 USD | **~0.38 BOB** | **~0.55 BOB** | Mensajes de promociones, ofertas de servicios estéticos, campañas publicitarias. |
| **Utilidad (Utility)** | ~$0.020 USD | **~0.14 BOB** | **~0.20 BOB** | **Muy frecuente:** Recordatorios de citas automáticas, alertas de pago, confirmaciones de reserva. |
| **Autenticación** | ~$0.015 USD | **~0.10 BOB** | **~0.15 BOB** | Códigos de inicio de sesión de seguridad (OTP). |
| **Servicio (Service)** | **Gratis** | **0.00 BOB** | **0.00 BOB** | Respuestas libres que envían tus agentes de soporte/ventas al cliente dentro de una ventana de 24 horas. |

---

## 3. Ventanas Gratuitas y Ahorros de Costo en Bolivia

Para optimizar el presupuesto del CRM en Bolivia, debes aprovechar los dos tipos de ventanas gratuitas:

* **Ventana de Servicio (24 horas):** Cuando un paciente te escribe preguntando por un servicio, se abre una ventana de 24 horas. Dentro de esa ventana, **no pagas nada** por enviar mensajes de texto libre, multimedia o plantillas de utilidad para responderle.
* **Ventana de Anuncio (72 horas, "Free Entry Point"):** Si publicitas con anuncios del tipo "Enviar mensaje a WhatsApp" (Click-to-WhatsApp) y el paciente hace clic y te contacta, las **plantillas** que le mandes durante las siguientes **72 horas no se cobran**.

  **Ojo, que esto se entendió mal y llegó a estar mal escrito aquí:** la ventana
  de 72 h **no** habilita texto libre ni sustituye a la de 24 h. Son
  independientes. La única que permite escribir libremente es la CSW de 24 h
  desde el último mensaje del paciente; pasadas esas 24 h solo salen plantillas,
  y lo que decide la de 72 h es si esa plantilla se cobra o no. El código lo
  refleja así: ver `ventana72hMetaActiva` y `fueraDeVentana24h` en
  `src/app/features/conversaciones/services/conversaciones-state.service.ts`,
  donde está anotado con la referencia a la documentación de Meta.

---

## 4. Costos de Captura de Leads (Meta Lead Ads)

Si realizas campañas en Bolivia con formularios integrados de Facebook Ads:
* **Webhook e Integración con el CRM:** **$0.00 USD / 0.00 BOB**. Meta no cobra por el uso de la API ni por enviar los datos de los leads a tu NestJS backend.
* **Costo por Lead (CPL) Promedio en Bolivia:** En Bolivia, el costo para capturar los datos de un paciente interesado en servicios estéticos o médicos suele estar entre **$1.00 USD (~7 BOB a 10 BOB)** y **$3.00 USD (~21 BOB a 30 BOB)** según la segmentación de la campaña.

---

## 5. Costos de Infraestructura e Implementación (Nube)

Al operar a gran escala (miles de mensajes y leads mensuales), debes presupuestar el soporte del servidor:

1. **Almacenamiento de fotos, audios y archivos (Cloudflare R2 / S3 API):**
   * Los pacientes envían fotos de tratamientos o audios explicativos. Meta solo los retiene 30 días.
   * El CRM los descarga y almacena de forma privada en **Cloudflare R2** (compatible con S3 API vía `aws4fetch` y URLs firmadas efímeras). Ventaja clave: **$0 de costos por transferencia saliente (egress)** y primer tramo gratuito de 10 GB al mes. Costo estimado: **$0.00 a $1.50 USD al mes**.
2. **Servidor NestJS y Base de Datos PostgreSQL (VPS):**
   * Hosting del backend NestJS para responder webhooks en milisegundos: **$15 a $30 USD mensuales (~105 BOB a 300 BOB)**.
   * Base de datos (concurrencia de múltiples agentes y leads): **$25 a $50 USD mensuales (~174 BOB a 500 BOB)**.
3. **Línea telefónica boliviana activa (+591):**
   * Plan mensual prepago/postpago con una operadora local (Tigo, Entel, Viva) para mantener la línea activa de WhatsApp Business: **~30 BOB a 100 BOB mensuales**.

---

## 6. Descuentos por Volumen (Volume Tiers)

Meta reduce automáticamente la tarifa de **Utilidad** y **Autenticación** a medida
que sube el volumen mensual de mensajes de la WABA. Los niveles se reinician cada
mes. No hay que pedirlos ni configurarlos.

---

## 7. Proyección Mensual de Ejemplo (10,000 interacciones de Utilidad/Citas)

Si envías **10,000 recordatorios de cita** automáticos al mes a pacientes en Bolivia fuera de la ventana de 24 horas:

* **Costo en USD:** 10,000 * 0.020 USD = **$200 USD**
* **Costo en BOB (Oficial 6.96):** 10,000 * 0.14 BOB = **1,400 BOB**
* **Costo en BOB (Paralelo 10.00):** 10,000 * 0.20 BOB = **2,000 BOB**

*Nota: Todos estos cobros se debitarán directamente de la tarjeta de crédito o débito que tengas asociada a tu cuenta comercial de Meta.*

---

## 8. Enlaces Oficiales de Referencia

* **Precios de WhatsApp**: [Meta for Developers — WhatsApp Pricing](https://developers.facebook.com/docs/whatsapp/pricing). Desde ahí se descarga el **tarifario en Excel**, que Meta actualiza cada mes con el costo exacto por código de país. Es la fuente; esta tabla es una foto.
* **Formularios de Leads**: [Meta Lead Ads Graph API Docs](https://developers.facebook.com/docs/marketing-api/guides/lead-ads)
* **Cómo configurar todo esto en el portal de Meta**: [`META_INTEGRATION_GUIDE.md`](META_INTEGRATION_GUIDE.md)
