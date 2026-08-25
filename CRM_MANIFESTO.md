# CRM_MANIFESTO.md: Arquitectura y Principios

> **Qué es este documento y qué no es.** Esto son los principios que rara vez
> cambian: límites de dominio, filosofía de UI moderna, identidad de marca. El
> detalle que **sí** cambia seguido —qué módulos existen hoy, el inventario
> exacto de átomos, la tabla completa de tokens, las cicatrices y decisiones
> recientes— vive en `.claude/skills/` de cada repo (backend:
> `crm-backend-module`, `crm-backend-arquitectura`; frontend:
> `crm-design-system`, `crm-feature-page`, `crm-conversaciones`,
> `crm-finanzas`, `crm-rendimiento`) y se verifica solo en cada build
> (`npm run check:skills`, encadenado a `npm run build` en los dos repos).
>
> Este manifiesto **no** se autoverifica, así que solo debe afirmar lo que casi
> nunca cambia. Cualquier lista concreta que pusiéramos acá (módulos, átomos,
> archivos puntuales) se desactualiza sin que nada lo avise — y es exactamente
> lo que le pasó a la versión anterior de este archivo: le faltaban 6 de los 12
> módulos reales del backend, la lista de *features* del frontend citaba dos
> carpetas que ya no existen (`comisiones`, `kpis`), nombraba un
> `admin.guard.ts` que un refactor ya había reemplazado por `exigeRol()`,
> describía una tipografía decorativa que nunca se usó en el código, y a la
> paleta le faltaban 3 tokens reales. Reescrito el 2026-08-25 para corregir
> eso — ver la nota de cierre al final del documento.
>
> **Para cualquier IA que entre a este proyecto:** si tu herramienta lee
> `.claude/skills/` (Claude Code), cargalos antes que este documento para
> cualquier tarea concreta — tienen el código citado y verificado. Si tu
> herramienta no los lee, este documento más `GEMINI.md` (raíz de `CRM/`) son
> tu mejor resumen. Ante cualquier duda, **el código manda sobre los dos**.

---

## Tabla de Contenidos

1. [Arquitectura del Sistema](#1-arquitectura-del-sistema-límites-de-dominio-e-integridad)
2. [Angular Moderno — Directrices Oficiales de angular.dev/ai](#2-angular-moderno--directrices-oficiales-de-angulardevai)
3. [Sistema de Diseño e Identidad Visual](#3-sistema-de-diseño-e-identidad-visual)
4. [Protocolo de Reutilización de Componentes](#4-protocolo-de-reutilización-de-componentes-diseño-atómico)
5. [Instrucciones de Flujo de Trabajo para la IA](#5-instrucciones-de-flujo-de-trabajo-para-la-ia)
6. [Configuración Técnica del Proyecto](#6-configuración-técnica-del-proyecto)
7. [Protocolo de Activación](#7-protocolo-de-activación)

---

## 1. Arquitectura del Sistema (Límites de Dominio e Integridad)

### 1.1 Backend (NestJS + Prisma + PostgreSQL)

| Regla | Descripción |
|-------|-------------|
| **Encapsulamiento de Módulo** | Cada dominio bajo `src/modules/` debe ser 100% autocontenido. La lista de módulos reales cambia con el producto — no la copies en un documento nuevo; `ls backend-crm-montalvo/src/modules/` o el skill `crm-backend-arquitectura` la tienen siempre al día. |
| **Aislamiento de Persistencia** | Un módulo tiene **estrictamente prohibido** consultar o modificar la base de datos de otro módulo. Toda comunicación cruzada se realiza exponiendo y consumiendo métodos públicos a través de los **Services**. |
| **Validación Perimetral** | Toda entrada externa de datos (webhooks de Meta, inputs de ventanilla) debe ser procesada y validada estrictamente por un **DTO** antes de tocar la lógica de negocio. |
| **Modelo Único** | El archivo `schema.prisma` es la **única fuente de verdad**. No se permite duplicar tipos de datos manuales en archivos externos. |

### 1.2 Frontend (Angular 21+)

| Regla | Descripción |
|-------|-------------|
| **Arquitectura Feature-Driven** | La estructura del frontend replica la modularidad del backend por carpetas: `src/app/features/{dominio}/`. |
| **No Invención** | Queda **estrictamente prohibido** generar estilos inline, clases CSS manuales aisladas o componentes redundantes. Si una interfaz requiere un elemento (tarjeta, botón, tabla, input), la IA debe buscar primero en `src/app/shared/components/` y reutilizarlo. |
| **Alineación Backend-Frontend, con una excepción documentada** | Los dominios de *feature* corresponden en general 1:1 con los módulos del backend. **Un hub de frontend puede consolidar varios módulos cuando la experiencia de usuario lo pide** — `/finanzas` es el caso real: una sola pantalla para la liquidación, la analítica, el resumen anual y el tipo de cambio, con pestañas que no recargan. Eso está documentado como decisión, no como deuda, en el skill `crm-finanzas`. Lo que sigue prohibido es crear una carpeta de *feature* que no corresponda a ningún módulo real ni a un hub documentado. |

---

## 2. Angular Moderno — Directrices Oficiales de angular.dev/ai

> **Fuente:** [angular.dev/ai](https://angular.dev/ai) · [angular.dev/llms.txt](https://angular.dev/llms.txt) · Angular Developer Skill (`/.agents/skills/angular-developer/`)
>
> Este proyecto utiliza **Angular v21.2** con **Tailwind CSS v4**. Las siguientes reglas son **obligatorias e irrevocables**.

### 2.1 Standalone por Defecto (Zero NgModules)

```typescript
// ✅ CORRECTO — Standalone implícito en Angular 21
@Component({
  selector: 'app-lead-card',
  imports: [CommonModule, RouterLink],
  templateUrl: './lead-card.html',
  styleUrl: './lead-card.css'
})
export class LeadCard { }

// ❌ PROHIBIDO — No usar NgModule, no usar `standalone: true` explícito
@NgModule({ declarations: [LeadCard] })
export class LeadsModule { }
```

- Los componentes, directivas y pipes son standalone por defecto en Angular 21.
- **No** agregar `standalone: true` en el decorador (ya es implícito).
- **No** crear `NgModule` para agrupar componentes. Usar `imports` directamente en el decorador del componente.

### 2.2 Signals como Sistema de Reactividad Principal

```typescript
// ✅ CORRECTO — Signals para estado, computed para derivados
export class LeadsList {
  private readonly leadService = inject(LeadService);

  protected readonly leads = signal<Lead[]>([]);
  protected readonly searchTerm = signal('');
  protected readonly filteredLeads = computed(() =>
    this.leads().filter(l => l.nombre.toLowerCase().includes(this.searchTerm().toLowerCase()))
  );
}

// ❌ PROHIBIDO — BehaviorSubject/Subject para estado local de UI
private leads$ = new BehaviorSubject<Lead[]>([]);
```

- Usar `signal()` para estado mutable local.
- Usar `computed()` para estado derivado (mantener funciones puras).
- Usar `linkedSignal()` para estado dependiente con escritura.
- Usar `resource()` / `httpResource()` para datos asíncronos reactivos.
- Usar `effect()` **únicamente** para side-effects (logging, DOM de terceros). **Nunca** para derivar estado.
- RxJS queda permitido **solo** para streams complejos (WebSocket, eventos multi-fuente) y para interop con `toSignal()` / `toObservable()`.

### 2.3 Inyección de Dependencias con `inject()`

```typescript
// ✅ CORRECTO — inject() funcional
export class ConversacionesPage {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);
}

// ❌ PROHIBIDO — Inyección por constructor
constructor(private http: HttpClient, private router: Router) { }
```

- **Siempre** usar la función `inject()` en lugar de inyección por constructor.
- Marcar inyecciones como `private readonly`.
- Servicios con `providedIn: 'root'` para inyección global. Usar `providers` del componente solo para instancias locales.

### 2.4 Control Flow Nativo en Templates

```html
<!-- ✅ CORRECTO — Control flow moderno -->
@if (leads().length > 0) {
  @for (lead of filteredLeads(); track lead.id) {
    <app-lead-card [lead]="lead" />
  } @empty {
    <app-empty-state message="No se encontraron leads" />
  }
} @else {
  <app-loading-skeleton />
}

@switch (lead().estado) {
  @case ('nuevo') { <app-badge variant="info">Nuevo</app-badge> }
  @case ('contactado') { <app-badge variant="warning">Contactado</app-badge> }
  @case ('convertido') { <app-badge variant="success">Convertido</app-badge> }
}

<!-- ❌ PROHIBIDO — Directivas estructurales legacy -->
<div *ngIf="leads.length > 0">
  <div *ngFor="let lead of leads">
```

- **`@if`**, **`@for`**, **`@switch`** son obligatorios. Prohibido `*ngIf`, `*ngFor`, `*ngSwitch`.
- **`@for`** requiere expresión `track` siempre (preferir `track item.id`).
- Usar `@empty` para estados vacíos dentro de `@for`.
- Usar `@defer` para carga diferida de componentes pesados.

### 2.5 Signal Inputs y Outputs

```typescript
// ✅ CORRECTO — Signal-based inputs/outputs (Angular 21)
export class LeadCard {
  readonly lead = input.required<Lead>();
  readonly variant = input<'compact' | 'full'>('full');
  readonly selected = output<Lead>();
}

// ❌ PROHIBIDO — Decoradores legacy
@Input() lead!: Lead;
@Output() selected = new EventEmitter<Lead>();
```

- Usar `input()` / `input.required()` para propiedades de entrada.
- Usar `output()` para eventos de salida.
- Usar `model()` para two-way binding.

### 2.6 Signal Forms (Angular 21+)

```typescript
// ✅ CORRECTO — Signal Forms para formularios nuevos
export class NuevoLeadForm {
  protected readonly nombre = new FormField('', { validators: [Validators.required] });
  protected readonly telefono = new FormField('', { validators: [Validators.required] });
}
```

- Para **formularios nuevos**, preferir **Signal Forms** (disponibles en Angular 21+).
- Formularios existentes con Reactive Forms pueden mantenerse por consistencia.
- Consultar referencia: `/.agents/skills/angular-developer/references/signal-forms.md`

### 2.7 Routing y Carga Diferida

```typescript
// ✅ CORRECTO — Lazy loading por feature
export const routes: Routes = [
  {
    path: 'dashboard',
    loadComponent: () => import('./features/dashboard/dashboard.page').then(m => m.DashboardPage)
  },
  {
    path: 'leads',
    loadChildren: () => import('./features/leads/leads.routes').then(m => m.LEADS_ROUTES)
  }
];
```

- Cada feature-module tiene su propio archivo de rutas (`{feature}.routes.ts`).
- Usar `loadComponent` para componentes lazy individuales.
- Usar `loadChildren` para sub-rutas de un dominio completo.
- Guards como funciones (`CanActivateFn`) en lugar de clases.

### 2.8 Capa de datos: servicios de dominio (obligatorio)

> **Regla:** una página **nunca** inyecta `HttpClient` ni escribe una URL.
> Cada dominio expone su `<dominio>.service.ts`, que se apoya en `core/api/api.service.ts`.

- Lecturas: el servicio devuelve la **petición** (`ResourceRequest`); la página la consume
  con `httpResource()` para que la reactividad siga viviendo en el componente.
- Comandos (POST/PATCH/DELETE): el servicio devuelve `Promise`; la página hace `await` y
  luego `recurso.reload()`.
- Errores: siempre `mensajeDeError(err, respaldo)` de `core/api/http-error.ts`.
  Prohibido `catch (err: any)` y leer `err.error?.message` a mano.

Ver la skill `crm-feature-page` para el patrón completo con ejemplos — incluye
además el interceptor de sesión (refresh silencioso ante un 401) y el patrón
de roles, que no repetimos acá porque son código, no principio.

### 2.9 HttpClient y httpResource

```typescript
// ✅ CORRECTO — httpResource para fetching reactivo
export class LeadService {
  private readonly http = inject(HttpClient);

  readonly leadsResource = httpResource<Lead[]>({
    url: '/api/leads',
  });
}
```

- Usar `httpResource()` para data fetching declarativo y reactivo.
- Usar `HttpClient` con `provideHttpClient(withInterceptorsFromDi())` para casos avanzados.
- Interceptores como funciones (`HttpInterceptorFn`).

### 2.10 Testing

- Framework de testing: **Vitest** (ya configurado en el proyecto).
- Usar `TestBed` con componentes standalone directamente.
- Usar **Component Harnesses** para interacción robusta con componentes.
- Consultar: `/.agents/skills/angular-developer/references/testing-fundamentals.md`

### 2.11 Convenciones de Nomenclatura y Archivos

| Tipo | Convención | Ejemplo |
|------|-----------|---------|
| Componente (Página) | `{nombre}.page.ts` | `dashboard.page.ts` |
| Componente (UI) | `{nombre}.component.ts` | `lead-card.component.ts` |
| Servicio | `{nombre}.service.ts` | `lead.service.ts` |
| Guard | `{nombre}.guard.ts` | `auth.guard.ts` |
| Interceptor | `{nombre}.interceptor.ts` | `token.interceptor.ts` |
| Modelo/Interface | `{nombre}.model.ts` | `lead.model.ts` |
| Rutas | `{dominio}.routes.ts` | `leads.routes.ts` |
| Pipe | `{nombre}.pipe.ts` | `currency-format.pipe.ts` |

- Nombres de archivo en **kebab-case**.
- Nombres de clases en **PascalCase**.
- Propiedades y métodos en **camelCase**.
- Prefijo de selector: `app-` (definido en `angular.json`).

---

## 3. Sistema de Diseño e Identidad Visual

> Basado en el Tablero de Marca Oficial. Los tokens exactos (valores hex, las
> sombras permitidas, los radios permitidos) viven en `src/styles.css` y se
> listan — verificados contra el código en cada build — en el skill
> `crm-design-system`: es la tabla que hay que mirar para el valor exacto de un
> token. Acá van los principios que no cambian con cada token nuevo.

### 3.1 Filosofía cromática

- Paleta **cerrada**: nunca un hex nuevo suelto en un componente; cualquier
  tono adicional se deriva de los tokens existentes con `color-mix()`.
  `check:skills` rechaza el build si aparece un hex ajeno a la paleta, en
  `.css` o en `.ts`.
- **Sin rojo ni ámbar de alarma, a propósito**: mantiene la línea "premium
  médico" calmada en vez de un panel tipo semáforo. Los estados semánticos
  (éxito, info, neutral, crítico) reutilizan los tonos de marca — `critical`
  es negro, no rojo.
- **Sin logo de marca**: el proyecto es agnóstico de marca. No inventar
  iniciales, isotipos ni nombre de clínica en el código — el slot de logo
  (topbar, login) queda vacío hasta que el cliente entregue el suyo.

### 3.2 Geometría

Línea de **"Minimalismo Médico Orgánico y Premium"**: no es un panel
empresarial rígido ni un entorno de analítica oscura. Botones siempre en
píldora, inputs con esquinas suaves, tarjetas redondeadas con una sombra
sutil. Los valores exactos (radios en px, las dos sombras permitidas y sus
nombres de token) están en `crm-design-system`.

### 3.3 Tipografía

**Poppins** es la única tipografía de la interfaz — datos, estructura,
etiquetas, todo. Jerarquía de tamaños y pesos exactos en `crm-design-system`.

> Si en algún momento se agrega una segunda tipografía decorativa de marca
> (para un claim de bienvenida, por ejemplo), documentala acá **y** en
> `crm-design-system` a la vez, con dónde se usa y dónde no. Nunca en un solo
> lugar: un lugar sin el otro es exactamente el tipo de desincronía que esta
> reescritura vino a arreglar. Hoy no hay ninguna — todo texto de interfaz es
> Poppins.

---

## 4. Protocolo de Reutilización de Componentes (Diseño Atómico)

Para que el código sea escalable, se sigue Diseño Atómico: átomos puros en
`src/app/shared/components/` (botón, input, badge, ícono, tabla, paginador,
gráficos…), moléculas que los combinan, organismos que arman una pantalla
completa. **El inventario exacto** —qué átomo existe hoy y qué
`input()`/`output()` acepta cada uno— está en `crm-design-system`, verificado
contra el `.component.ts` de cada átomo en cada build; no lo dupliques en otro
documento.

### 4.1 La regla de oro

Si la IA detecta que está escribiendo código repetido en dos pantallas
distintas:

1. **Detenerse.**
2. Decidir qué se repite. Si es *marcado* (la misma estructura de tags, un
   `input()`, un evento propio), corresponde un átomo nuevo en `shared/`. Si
   es *solo estilo* (una celda, una fila clicable, un badge) sin nada que
   envolver, alcanza con una clase utilitaria en `styles.css` — menos
   ceremonia para el mismo resultado. El criterio completo, con un caso real,
   está en `crm-design-system`.
3. Extraer, no copiar — y si la tarea afecta a más de una pantalla ya
   existente, **pedir confirmación** antes de tocarlas todas (ver §5, Paso 3).

### 4.2 Estructura de directorios (el patrón, no el inventario de hoy)

```
src/app/
├── core/                   # Servicios singleton, guards, interceptors (auth, api, toast…)
├── shared/                 # Átomos, moléculas, pipes, directivas reutilizables
│   ├── components/
│   ├── pipes/
│   ├── directives/
│   └── models/
├── features/<dominio>/     # Un directorio por dominio de negocio
│   ├── <dominio>.page.ts
│   ├── <dominio>.page.html
│   ├── <dominio>.page.css
│   ├── <dominio>.service.ts    # endpoints del dominio (obligatorio, ver §1.2 y §2.8)
│   ├── <dominio>.model.ts      # espejo de la respuesta del backend
│   └── components/             # Componentes locales de ese feature
├── app.config.ts
└── app.routes.ts
```

**No hardcodees la lista real de `features/` ni de `shared/components/` en
ningún documento nuevo** — enumerar esa lista concreta es, literalmente, cómo
se desactualizó la versión anterior de este archivo. `ls src/app/features/` o
el inventario de `crm-design-system` la tienen siempre al día.

---

## 5. Instrucciones de Flujo de Trabajo para la IA

> **Execution & Skills Protocol:** al ejecutar tareas en este repositorio, operar bajo estos pasos.

### Paso 0 (si tu herramienta lee `.claude/skills/`)

Cargá el skill del dominio que vas a tocar antes que cualquier otra cosa —
tiene el código citado y `check:skills` lo mantiene honesto. Este manifiesto
da el marco de principios; los skills dan el patrón exacto con ejemplos
reales y las cicatrices de qué se rompió antes por no seguirlo. **Si alguna
vez se contradicen, gana el skill** — es el que se verifica contra el código
en cada build; este documento no.

### Paso 1: Análisis de Impacto

- [ ] Repasa los principios de este documento (límites de dominio §1, paleta cerrada §3, Angular moderno §2)
- [ ] Si tu cambio toca código, carga el skill del dominio correspondiente para el detalle verificado
- [ ] Analiza si tu cambio rompe algún límite de dominio
- [ ] Confirma que usas APIs modernas de Angular (Signals, `inject()`, `@if`/`@for`/`@switch`)

### Paso 2: Inspección de Componentes Existentes

- [ ] Escanea `src/app/shared/components/` antes de proponer código para una interfaz
- [ ] Si el componente ya existe, **reutilízalo** extendiendo sus propiedades mediante `input()` / `output()` de Angular
- [ ] **No** crear componentes duplicados bajo ninguna circunstancia

### Paso 3: Presentación del Plan

- [ ] Muestra la **lista exacta** de archivos que vas a modificar o crear
- [ ] Si la tarea afecta a **más de un módulo** del CRM, **detén tu ejecución** y espera la confirmación explícita del ingeniero
- [ ] Si se requiere una nueva dependencia externa, solicita autorización antes de instalarla

### Paso 4: Verificación de Código Limpio

- [ ] El código generado debe ser simple, legible y con nombres coherentes
- [ ] **No** agregar librerías o dependencias externas de diseño sin autorización
- [ ] Ejecutar `npm run build` después de cada cambio significativo (encadena los validadores y la compilación)
- [ ] Todo componente nuevo debe seguir las convenciones de nomenclatura de la Sección 2.11

### Paso 5: Validación Angular Moderna

- [ ] Verificar que **no** se usan patrones legacy:
  - ❌ `NgModule`
  - ❌ `*ngIf` / `*ngFor` / `*ngSwitch`
  - ❌ `@Input()` / `@Output()` decorators
  - ❌ Constructor injection
  - ❌ `BehaviorSubject` para estado local de UI
- [ ] Verificar que **sí** se usan patrones modernos:
  - ✅ Componentes standalone (implícito)
  - ✅ `signal()` / `computed()` / `linkedSignal()` / `resource()`
  - ✅ `inject()`
  - ✅ `@if` / `@for` / `@switch`
  - ✅ `input()` / `output()` / `model()`
  - ✅ Signal Forms (para formularios nuevos)

---

## 6. Configuración Técnica del Proyecto

| Aspecto | Valor |
|---------|-------|
| **Framework** | Angular 21.2 |
| **Lenguaje** | TypeScript 5.9 |
| **Estilos** | Tailwind CSS 4.1 (PostCSS) |
| **Testing** | Vitest 4.0 |
| **Build** | `@angular/build:application` |
| **Package Manager** | npm 10.9 |
| **Prefix** | `app` |
| **Strict Mode** | Habilitado (`strict: true`, `strictTemplates: true`) |
| **Target** | ES2022 |

### 6.1 Recursos de Referencia Técnica

La skill de Angular (`/.agents/skills/angular-developer/`) contiene referencias detalladas para:

| Tema | Archivo de referencia |
|------|----------------------|
| Componentes | `references/components.md` |
| Signal Inputs | `references/inputs.md` |
| Signal Outputs | `references/outputs.md` |
| Signals Overview | `references/signals-overview.md` |
| LinkedSignal | `references/linked-signal.md` |
| Resource / httpResource | `references/resource.md` |
| Effects | `references/effects.md` |
| Signal Forms | `references/signal-forms.md` |
| Reactive Forms | `references/reactive-forms.md` |
| Routing | `references/define-routes.md` |
| Guards | `references/route-guards.md` |
| Testing | `references/testing-fundamentals.md` |
| Angular Aria (a11y) | `references/angular-aria.md` |
| Animations CSS | `references/angular-animations.md` |
| Component Styling | `references/component-styling.md` |
| Tailwind CSS | `references/tailwind-css.md` |
| CLI | `references/cli.md` |

### 6.2 Documentación Oficial Angular

> [angular.dev/llms.txt](https://angular.dev/llms.txt) — Mapa completo de la documentación de Angular para contexto de LLMs.

---

## 7. Protocolo de Activación

### Para Sesiones de Desarrollo con IA

Al iniciar cualquier sesión de desarrollo con IA (Antigravity, Gemini CLI,
Copilot, Cursor, Claude Code, o cualquier asistente agéntico), el **primer
comando obligatorio** debe ser:

> *"Lee `CRM_MANIFESTO.md` en la raíz del repo. Si tu herramienta soporta
> `.claude/skills/`, cargalos también antes de tocar código — ahí está el
> detalle verificado. Configura tus directivas de comportamiento en base a los
> principios de este documento y, para código concreto, en base a los skills.
> No alteres los principios arquitectónicos durante toda la vida del
> desarrollo — sí corregí este documento si encontrás que quedó
> desactualizado en un hecho concreto, dejando registro de qué cambió."*

### Validación de Cumplimiento

La IA debe ser capaz de responder afirmativamente a **todas** estas preguntas antes de escribir código:

1. ¿El cambio respeta los límites de dominio definidos en la Sección 1?
2. ¿Se usan exclusivamente APIs modernas de Angular (Sección 2)?
3. ¿Los colores utilizados pertenecen a la paleta cromática vigente (Sección 3, detalle en `crm-design-system`)?
4. ¿Se reutilizaron componentes existentes antes de crear nuevos (Sección 4, inventario en `crm-design-system`)?
5. ¿Se siguió el protocolo de ejecución de la Sección 5?

---

> **Qué tan estable es este documento.** Cambia solo cuando cambia una
> decisión de arquitectura de verdad — un nuevo límite de dominio, un cambio
> de framework, una decisión de marca. **No** debería cambiar para corregir un
> inventario: eso es exactamente lo que rompió la versión anterior. Si en el
> futuro este archivo vuelve a acumular una lista concreta de módulos, átomos
> o archivos puntuales, es la misma señal de alerta — mové esa lista al skill
> correspondiente en vez de mantenerla acá.
>
> **Reescrito el 2026-08-25** para corregir desincronización real: le faltaban
> 6 de los 12 módulos reales del backend (`memoria-agente`,
> `planilla-comisiones`, `plantillas-agente`, `servicios`, `tipo-cambio`,
> `usuarios`), la lista de *features* del frontend citaba `comisiones` y
> `kpis` como carpetas cuando ya no existen con esos nombres, nombraba un
> `admin.guard.ts` que el refactor de roles (`exigeRol()`) ya había
> reemplazado, describía una tipografía decorativa ("Bufalo") que no se usa en
> ningún lugar del código, y a la paleta le faltaban los tokens `bg-light`,
> `bg-workspace` y `border`. Autorizado por el Lead Developer del proyecto en
> esta sesión — la estrategia elegida fue recortar los inventarios que se
> desactualizan solos y reemplazarlos por punteros a los skills que sí se
> verifican en cada build, en vez de volver a escribirlos a mano acá.
