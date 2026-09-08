# CRM Clínica Montalvo — frontend

Angular 21 (signals, `OnPush` en todo), Tailwind v4, PWA. Se despliega en Vercel.
Habla con el backend NestJS que vive en el repo hermano `backend-crm-montalvo`.

Lo usan a diario agentes de venta reales sobre datos de pacientes reales, y **no
hay entorno de staging**.

## Levantarlo

Node **22.23.2** (`.nvmrc`; mínimo de la rama 22: 22.12), npm 10 (comprobado: Node 22.23.2 / npm 10.9.8).
El `>=22` del proyecto no expresa el mínimo más estricto de sus dependencias.
Los dos repos van clonados bajo el mismo
directorio padre —`check:skills` busca al hermano por ruta relativa y avisa si
no lo encuentra, sin fallar—.

```bash
npm ci          # no `npm install`: reconstruye exactamente el lockfile
npm start       # ng serve en http://localhost:4200
```

Espera al backend en `http://localhost:3001`. Para levantarlo, ver [instalación local del backend](../backend-crm-montalvo/CLAUDE.md#instalación-y-arranque-local-linux--macos).

## Verificar

```bash
npm run build   # check:tipos + check:skills + ng build — la compuerta real
npm test -- --watch=false  # Vitest, ejecución finita
```

`npm run build` es lo que decide si un cambio está bien, y encadena tres cosas:

- **`check:tipos`** compara los enums de TypeScript contra `schema.prisma` del
  backend. La fuente de verdad es el backend; si divergen, falla. Se
  resincronizan con `npm run sync:tipos`.
- **`check:skills`** verifica que los `.claude/skills/` sigan describiendo el
  código real: rutas citadas, roles, helpers exportados.
- **`ng build`** compila.

## Dónde está lo demás

| Necesitas | Está en |
| --- | --- |
| Dónde va el trabajo y qué sigue | [`backend-crm-montalvo/docs/ESTADO_ACTUAL.md`](../backend-crm-montalvo/docs/ESTADO_ACTUAL.md) — **léelo primero** |
| Reglas que debe conocer un agente antes de tocar código | [`CLAUDE.md`](CLAUDE.md) y `.claude/skills/` |
| Principios de arquitectura y diseño | [`CRM_MANIFESTO.md`](CRM_MANIFESTO.md) |
| Cómo se usa el CRM, por rol | [`docs/MANUAL_USUARIO.md`](docs/MANUAL_USUARIO.md) |
| Configurar WhatsApp y Lead Ads en Meta | [`META_INTEGRATION_GUIDE.md`](META_INTEGRATION_GUIDE.md) |
| Qué cuesta cada mensaje | [`META_COSTOS.md`](META_COSTOS.md) |

El directorio padre que contiene ambos repos **no es un repositorio git**: nada
que viva solo ahí sobrevive a un cambio de máquina.
