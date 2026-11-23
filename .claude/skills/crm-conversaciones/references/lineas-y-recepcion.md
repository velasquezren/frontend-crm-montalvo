# Líneas y recepción (2026-09-13)

> Parte de la skill `crm-conversaciones`: lee antes su [índice](../SKILL.md).

La bandeja recibe `linea` en cada conversación y filtra por `lineaId` en el servidor. `RECEPCION` solo ve las líneas de atención asignadas a su usuario; no ve rutas comerciales. Agentes también necesitan membresía de línea. Admins ven todas. Las plantillas se consultan con la línea del chat abierto. No conservar borradores, adjuntos ni respuestas HTTP de otro chat/sesión al cambiar de contexto. Reasignar cambia únicamente el chat de esa línea.

### Contrato de líneas y despliegue (14-09-2026)

El push del frontend despliega Vercel; el del backend no actualiza el VPS. Cuando el contrato cambia, desplegar y verificar backend + migración antes de publicar frontend. Publicar la UI primero causó `linea.nombre` sobre undefined y un catálogo 404.

`validar-canal.ts` valida la identidad de línea al entrar por listado, detalle, páginas adicionales y resumen realtime. No inferir ventas para respuestas sin canal. En los consumidores usar `paginaInbox()`, `detalleActual()` y `agentesActuales()`: `httpResource.value()` puede lanzar cuando el recurso tiene error, incluso con `defaultValue`. El detalle fallido muestra reintento y no permite componer. Las pruebas del state reproducen el contrato antiguo y su recuperación.
