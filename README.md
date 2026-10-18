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
npm run build   # check:tipos + lint + ng build — la compuerta real
npm run lint              # reglas del CRM + análisis de plantillas/CSS y sus pruebas
npm run typecheck         # tipos de aplicación y pruebas, sin emitir archivos
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
- **`lint`** incluye `check:skills` y `tools/verificar-ui.mjs`. Usa los parsers
  instalados de TypeScript, Angular y PostCSS para comprobar plantillas externas
  e inline, nombres de controles, imágenes, archivos, pestañas, diálogos,
  cabeceras ordenables, `OnPush`, CSS duplicado y `:host` sin encapsulación.
  Sus regresiones se prueban con `node:test`. No es una certificación WCAG.
- **`ng build`** compila.

`.github/workflows/calidad.yml` ejecuta estas comprobaciones en PR y push a
main. Clona el schema del backend en un SHA fijo para que check:tipos no se
omita; actualizar ese SHA al cambiar enums. El workflow no despliega ni
configura por sí solo una compuerta en Vercel.

## Mapa de UI y mantenimiento desde código

Las rutas y guards viven en `src/app/app.routes.ts`; los destinos del menú en
`shared/components/layout/nav-items.ts`. `core/` mantiene sesión, red, moneda,
fechas y notificaciones. Las páginas orquestan servicios de dominio; las piezas
de presentación viven en `shared/components/`.

| Área / rutas | Estructura y patrones compartidos |
| --- | --- |
| Acceso y perfil (`auth/login`, `perfil`) | Inputs, botones y avatar; Perfil conserva Reactive Forms para datos personales y usa inputs signal en Mi Memoria. |
| Dashboard (`dashboard`) | KPIs y gráficos; series y permisos del dominio. |
| Pacientes y ventas (`clientes`, `leads`, `leads/registro-presencial`, `ventas`) | Tabla, filtros, paginador y drawers; kanban y formulario de venta especializados. |
| Atención (`conversaciones`) | Lista, hilo, compositor y panel lateral; envío, reintentos, socket y reservas siguen en sus servicios/componentes actuales. |
| Recepción (`actividades`, `reservas`, `resultados`) | Listados y drawers; calendario Schedule-X especializado, reservas de lectura y confirmaciones de resultados conservadas. |
| Catálogo (`directorio`, `promociones`) | Pestañas con teclado compartido y paneles retenidos; fichas, horarios y anuncios conservan sus contratos. |
| Campañas (`campanas`) | Lista y audiencia en pestañas; URL y montaje siguen en la página. |
| Informes (`servicios`, `finanzas`, `planilla`, `analitica`, `resumen-anual`, `desempeno-agentes`) | Paneles y barras de periodo en CSS común; tabla y cabeceras ordenables compartidas. Matrices, cálculos y clasificación especializados. |
| Administración (`usuarios`, `lineas-whatsapp`) | Controles y diálogos compartidos; editores de líneas con sus guardas y permisos. |

`src/styles.css` es la fuente de tokens y utilidades compartidas. Los estilos
de `TableComponent` y `TimelineComponent` son globales con prefijos porque
afectan contenido proyectado; el calendario tiene su tema acotado. Las demás
hojas permanecen encapsuladas. `shared/directives/tablist.directive.ts`
reutiliza solo teclado: no controla URLs, permisos ni cachés de pestañas.

Prioridad: acceso por teclado, foco y controles alcanzables en móvil; después
coherencia de superficies y reducción de CSS; finalmente descomposición cuando
exista una responsabilidad separable. El estado de Conversaciones, la página
de Planilla y las vistas de Ventas y Actividades son extensos: su longitud sola
no justifica separar estado o dividir flujos. Consultar sus pruebas antes de
extraer piezas.

Angular ESLint y Stylelint no están instalados. El control local aprovecha los
parsers presentes y las reglas del CRM; no añade paquetes ni duplica la regla
de nombres accesibles. Adoptarlos en el futuro debería sustituir las reglas
equivalentes y contemplar plantillas inline y Tailwind v4.

### Pendiente de validación visual

Código y jsdom no validan apariencia, contraste calculado ni layout/interacción
reales. Quedan para revisión visual posterior: densidad de tablas financieras,
recorte de sticky y foco, nombres largos, zoom y teclado virtual, menú a
390/768/1440 px y convivencia de cajones, ayudas y notificaciones. También debe
comprobarse la experiencia con lector de pantalla. No se requiere navegador
para ejecutar los checks.

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
