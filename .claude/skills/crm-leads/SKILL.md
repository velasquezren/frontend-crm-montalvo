---
name: crm-leads
description: Reglas de negocio, arquitectura del pipeline comercial Kanban, trazabilidad de captación multi-canal y ciclo de vida de prospectos en el módulo de Leads. Úsalo SIEMPRE que trabajes en leads.page, leads.service, el kanban drag-and-drop, filtros de origen, motivos de pérdida, conversión a venta o endpoints del backend en /leads.
---

# Leads & Pipeline Comercial

Este módulo gestiona la captación, calificación y conversión de prospectos en pacientes atendidos en Clínica Montalvo.

---

## 1. Ciclo de Vida y Estados del Lead

El pipeline comercial opera sobre 4 estados canónicos (`EstadoLead`):

1. **`NUEVO`**:
   - Prospecto recién captado que aún no ha recibido respuesta de un agente.
   - Orígenes: Meta Lead Ads (Facebook/Instagram), WhatsApp directo o registro presencial en ventanilla.
2. **`CONTACTADO`**:
   - El agente ha iniciado la conversación o agendado una cita/evaluación.
3. **`CONVERTIDO`**:
   - El lead se convierte en paciente con venta cerrada (consulta, ecografía, paquete de maternidad, cirugía o plan).
   - Se marca de forma manual o **automática** al registrar una venta en `VentasService` (`marcarConvertidos`).
4. **`PERDIDO`**:
   - El prospecto desiste o no califica.
   - **Regla Inmutable de Auditoría:** El backend exige obligatoriamente un `motivoPerdida` (mínimo 3 caracteres). La interfaz abre un modal modalizado con `DialogService` para solicitar el motivo antes de persistir el cambio.

---

## 2. Orígenes y Aislamiento del Archivo Histórico

- **Captación Activa vs. Histórico Importado:**
  - El sistema cuenta con más de **15.000 pacientes históricos** importados desde FileMaker con origen `IMPORTACION`.
  - **Invariante:** Los leads con origen `IMPORTACION` quedan **estrictamente excluidos por defecto** (`incluirImportacion=false`) para evitar saturar el tablero Kanban con miles de registros antiguos.
  - Para consultar el archivo histórico, se utiliza el filtro explícito *"Histórico importado"* o el módulo de **Clientes**.

- **Canales de Origen:**
  - `WHATSAPP_DIRECTO`: Contacto orgánico entrante al número oficial.
  - `FACEBOOK_LEAD_AD` / `INSTAGRAM_LEAD_AD`: Campañas de Meta Ads con sincronización de webhook.
  - `PRESENCIAL`: Alta rápida en recepción con deduplicación por número telefónico.

---

## 3. Arquitectura Frontend (Angular 21 + Signals)

- **Dualidad de Vistas:**
  - **Pipeline Kanban (`PIPELINE`)**: Drag & Drop interactivo mediante `@angular/cdk/drag-drop` con `linkedSignal` optimista (`leadsLocales`).
  - **Vista Tabla (`LISTA`)**: Listado paginado con servidor (`PaginationDto`) para auditorías masivas.
- **Búsqueda en Tiempo Real (`q`)**:
  - Búsqueda debounced (200 ms) insensible a mayúsculas/minúsculas sobre nombre del paciente, teléfono, campaña publicitaria y notas.
- **Conteos Reales por Columna (`GET /leads/resumen`)**:
  - La cabecera de cada columna del Kanban refleja el conteo real del servidor (`resumen.porEstado`), advirtiendo cuántas tarjetas quedan sin cargar si la columna supera las 100 tarjetas visibles.

---

## 4. Reglas de Seguridad y Escopado por Rol

- **`AGENTE`**:
  - Solo visualiza sus leads asignados + los leads sin asignar (pool general de captación).
- **`ADMIN` / `SUPER_ADMIN`**:
  - Visibilidad total y capacidad de reasignar leads entre ejecutivas.
