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

Espera al backend en `http://localhost:3001`. Para levantarlo, ver [instalación local del backend](../backend-crm-montalvo/README.md#instalación-y-arranque-local-linux--macos).

## Verificar

```bash
npm run build   # check:tipos + check:skills + ng build — la compuerta real
npm run check:tests        # también comprueba tipos de los archivos de pruebas
npm test -- --watch=false  # Vitest, ejecución finita
```

`npm run build` verifica reglas y compilación; no certifica por sí solo UX,
contratos de negocio ni despliegue. Genera el sello de versión y encadena:

- **`check:tipos`** compara los enums de TypeScript contra `schema.prisma` del
  backend. La fuente de verdad es el backend; si divergen, falla. Se
  resincronizan con `npm run sync:tipos`.
- **`check:skills`** verifica que los `.claude/skills/` sigan describiendo el
  código real: rutas citadas, roles, helpers exportados.
- **`ng build`** compila.

`.github/workflows/calidad.yml` ejecuta estas comprobaciones en PR y push a
main. Clona el schema del backend en un SHA fijo para que check:tipos no se
omita; actualizar ese SHA al cambiar enums. El workflow no despliega ni
configura por sí solo una compuerta en Vercel.

## Dónde está lo demás

- [CLAUDE.md](CLAUDE.md): instrucciones comunes de trabajo para todos los agentes.
- [Índice por responsabilidad](../backend-crm-montalvo/docs/README.md): guía y código
  del dominio, pruebas y antecedentes sin cargar todo el backend.
- [Estado breve](../backend-crm-montalvo/docs/ESTADO_ACTUAL.md): trabajo existente,
  pendientes verificados y límites de despliegue.
- [CRM_MANIFESTO.md](CRM_MANIFESTO.md): principios de arquitectura y marca.
- [Manual de uso](docs/MANUAL_USUARIO.md): recorridos para el equipo de la clínica.
- [Integración Meta](META_INTEGRATION_GUIDE.md) y [costos](META_COSTOS.md): operación
  y estimaciones fechadas, no pruebas de configuración ni tarifas vigentes.

El directorio padre no es un repositorio Git: los archivos de continuidad deben
vivir en uno de estos repos. Canales y permisos: [líneas WhatsApp](../backend-crm-montalvo/docs/lineas-whatsapp.md).
La lista inicial de una migración no demuestra qué números están conectados hoy.
