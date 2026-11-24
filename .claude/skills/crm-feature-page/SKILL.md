---
name: crm-feature-page
description: Patrón obligatorio para construir o modificar una vista (página) de este CRM Angular — capa de servicios, httpResource, filtros, estados de carga/error/vacío, modales, tiempo real y permisos por rol. Úsalo SIEMPRE al crear o tocar una página bajo src/app/features/, al conectar una vista al backend NestJS, al añadir una llamada HTTP, al abrir un modal, o al ocultar algo según el rol del usuario — incluso para cambios que suenan pequeños ("agrega un filtro", "muestra el total").
---

# Patrón de página de feature

Arquitectura: `CRM_MANIFESTO.md` §1.2 y §4.4. Angular 22 con signals, sin NgModules, sin RxJS para estado de UI.

## Consulta por tarea

Leer Reglas de oro y la sección del cambio: datos → Servicio/Página;
plantilla → cuatro estados; modal → DialogService; sesión → Autenticación;
permisos → Roles y Rutas; actualización externa → Tiempo real. El detalle de
chat, finanzas y diseño está en sus skills y solo se consulta si interviene.

## Referencias por tema (carga solo la que toque)

Cada archivo es una sección completa de esta skill; no hace falta leerlas todas.

- [Servicio de dominio](references/servicio-de-dominio.md) — Dos tipos de método:
- [Página](references/pagina.md) — export class ClientesPage {
- [Una ficha que editan varias personas: versión y solo lo que cambió](references/una-ficha-que-editan-varias-personas.md) — Promociones y el Directorio médico se editan desde varias sesiones a la vez (dos
- [Plantilla: los 4 estados obligatorios](references/plantilla-los-4-estados-obligatorios.md) — Toda vista con datos remotos cubre carga, error, vacío y contenido:
- [Modales: `DialogService` (CDK Overlay), nunca `@if` con `position: fixed`](references/modales-dialogservice-nunca-if-con-position.md) — Los modales se proyectan a document.body con Angular CDK Overlay, no con un @if en la propia
- [Rendimiento: el cuello de botella es la RED, no las consultas](references/rendimiento-el-cuello-de-botella-es.md) — Medido contra producción el 2026-08-05, desde Bolivia:
- [Un endpoint tiene UN dueño, porque dos dueños son dos contratos](references/un-endpoint-tiene-un-dueno-porque.md) — «Una página nunca construye URLs» no dice qué pasa cuando dos servicios
- [Una regla de negocio escrita en dos vistas es una función pura compartida](references/una-regla-de-negocio-escrita-en.md) — Es el modo de fallo más silencioso de este frontend: cada vista necesita la
- [Si dos componentes montados a la vez pintan el mismo recurso, la invalidación va en el SERVICIO](references/si-dos-componentes-montados-a-la.md) — Recargar «lo mío» después de mutar funciona mientras el recurso lo pinte un solo
- [Tiempo real: `RealtimeService` en vez de polling ciego](references/tiempo-real-realtimeservice-en-vez-de.md) — Un setInterval que recarga todo cada N segundos, siempre, haya o no algo
- [Envío optimista: no esperes el round-trip para mostrar el resultado](references/envio-optimista-no-esperes-el-round.md) — Si una acción del usuario tiene un resultado predecible (mandar un mensaje de
- [Autenticación: refresh silencioso ante un 401, con freno anti-bucle](references/autenticacion-refresh-silencioso-ante-un-401.md) — token.interceptor.ts adjunta el JWT a cada petición. Ante un 401 que no
- [Roles y permisos](references/roles-y-permisos.md) — La jerarquía es RECEPCION y ASISTENTE (0) < AGENTE (1) < ADMIN (2) < SUPER_ADMIN (3). Recepción entra en conversacion…
- [Rutas](references/rutas.md) — Lazy loading por página en app.routes.ts, dentro del layout con authGuard:
- [Montar una página con `@defer` en una prueba](references/montar-una-pagina-con-defer-en.md) — Si la plantilla tiene un @defer, el compilador le emite metadata asíncrona y

## Reglas de oro

- **Una página NUNCA inyecta `HttpClient` ni construye URLs.**
  Cada dominio tiene su servicio en `features/<dominio>/<dominio>.service.ts`, que se apoya en
  `core/api/api.service.ts`. Si añades un endpoint, va al servicio del dominio, no a la página.
- **Todo componente lleva `changeDetection: ChangeDetectionStrategy.OnPush`**, sin excepción
  (páginas y átomos compartidos por igual). Solo es seguro porque todo el estado es `signal()`/
  `computed()`/`input()` — si alguna vez necesitas mutar un campo de clase a mano fuera de un
  signal para que se refleje en la plantilla, es una señal de que ese estado debería ser un signal,
  no una razón para quitar OnPush.

## Anatomía de un dominio

```
features/clientes/
├── cliente.model.ts       # interfaces espejo de la respuesta del backend
├── clientes.service.ts    # endpoints del dominio (única fuente de URLs)
├── clientes.page.ts       # estado de UI con signals
└── clientes.page.html     # plantilla sobre átomos compartidos
```

### Un dominio con varias pestañas: una página, un componente por pestaña

Finanzas y Campañas son así:

```
features/campanas/
├── audiencia.model.ts / campana.model.ts   # un modelo por concepto
├── campanas.service.ts                     # UN servicio para todo el dominio
├── campanas.page.ts / .html                # cabecera + pestañas, nada más
└── components/
    ├── campana-audiencia/                  # pestaña «Audiencia»
    ├── campanas-lista/                     # pestaña «Campañas» (+ su ficha)
    └── nueva-campana/                      # cajón que lanza la audiencia
```

- La pestaña vive en la URL (`?tab=`): se comparte, sobrevive a F5 y Atrás la respeta.
- Cada pestaña se monta al visitarla y se queda montada (`.crm-pestanas-cuerpo`,
  `.crm-pestana-panel`, `.crm-pestana-panel-oculta` en `styles.css`, más
  `[attr.inert]`): volver no pide datos de nuevo ni pierde los filtros.
- Si un trabajo obliga a ir y volver entre dos entradas del menú, es UNA página.
  Audiencias y Campañas nacieron separadas (2026-10-01) y se unieron dos días
  después: la audiencia no tiene otro uso que lanzar una campaña. La ruta vieja
  redirige con la pestaña puesta (`redirectTo` con `createUrlTree`).

## Antes de dar por terminado

- `npx ng build` sin errores (**no uses el navegador en este proyecto**).
- Reutilizaste átomos de `shared/components/` en vez de HTML suelto — inventario y paleta en
  el skill `crm-design-system`.
- Los 4 estados (carga / error / vacío / contenido) están cubiertos.
- Ningún hex nuevo, ningún `any`, ningún `console.log`, ningún `rol === '…'` a mano.

- `npm run lint` incluye ESLint con tipos (`eslint.config.mjs`): promesas sin esperar
  o pasadas donde se espera `void` (usa `void this.x()` si el método ya captura sus
  errores), `switch` incompletos sobre un enum, `any`, `==`, `console.log`. No se
  desactiva una regla para pasar: se corrige la causa.

## Mantenimiento

`npm run check:skills` contrasta los datos de este archivo con el código (rutas citadas,
selectores, roles declarados en `core/auth/roles.ts`) y va encadenado a `npm run build`.

Verifica **datos, no criterio**: los patrones y el porqué de cada decisión se actualizan a mano.
Cuando el validador te contradiga, corrige el skill — el código es la verdad.
