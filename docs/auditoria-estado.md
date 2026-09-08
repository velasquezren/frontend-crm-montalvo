# Estado del plan de refactorización — puntero

El plan vive en el repo del **backend**, porque cubre los dos repos y allí están
todos los informes por hallazgo:

- `backend-crm-montalvo/docs/ESTADO_ACTUAL.md` — qué fase está cerrada, en qué
  commit, y qué sigue. **Leerlo antes de tocar nada**, junto con `git fetch` en
  los dos repos: se trabaja desde dos máquinas.
- `backend-crm-montalvo/docs/auditoria-arquitectonica-2026-09-05.md` — el informe
  completo. §19 tiene las diez fases; §10 y §13, lo que toca a este repo.

Su veredicto de fondo también gobierna aquí: **no se reescribe nada**. Angular
por funcionalidades y `httpResource` para lecturas ligadas a filtros se
conservan; lo que se corrige son las fronteras.

## Lo que este repo tiene pendiente

F06 está diagnosticado y sin corregir — la reproducción y la evidencia están en
`backend-crm-montalvo/docs/auditoria-etapa2/`, y el resumen en
[`auditoria-f06-etapa2.md`](auditoria-f06-etapa2.md):

1. Descarte por ID de conversación en `src/app/features/conversaciones/services/conversaciones-state.service.ts`.
2. Reset de los stores en memoria al hacer `logout()`.
3. Un solo Service Worker: `ngsw-worker.js` y `sw.js` compiten por el scope raíz.
4. Móvil (390px): Actividades gasta demasiado alto antes de la primera tarea.

Después vienen F07 (igualdad del hilo y aislamiento de respuestas por clave) y
F08 (calendario e historiales paginados de verdad), ambos descritos en §19.
