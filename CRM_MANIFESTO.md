# CRM_MANIFESTO.md: Fuente de la Verdad Absoluta (SSOT)

> **DIRECTIVA CRÍTICA DE EJECUCIÓN:** Este documento rige de manera inmutable el ciclo de vida completo de este software. Antes de escribir, modificar o refactorizar cualquier archivo, debes validar el cumplimiento de las reglas aquí expuestas. Está **estrictamente prohibido** inventar nuevas variables visuales, esquemas relacionales o romper los límites de dominio.

---

## Tabla de Contenidos

1. [Arquitectura del Sistema](#1-arquitectura-del-sistema-límites-de-dominio-e-integridad)
2. [Angular Moderno — Directrices Oficiales de angular.dev/ai](#2-angular-moderno--directrices-oficiales-de-angulardevai)
3. [Sistema de Diseño e Identidad Visual](#3-sistema-de-diseño-e-identidad-visual-clínica-montalvo)
4. [Protocolo de Reutilización de Componentes](#4-protocolo-de-reutilización-de-componentes-diseño-atómico)
5. [Instrucciones de Flujo de Trabajo para la IA](#5-instrucciones-de-flujo-de-trabajo-para-la-ia)
6. [Configuración Técnica del Proyecto](#6-configuración-técnica-del-proyecto)
7. [Protocolo de Activación](#7-protocolo-de-activación)

---

## 1. Arquitectura del Sistema (Límites de Dominio e Integridad)

### 1.1 Backend (NestJS + Prisma + PostgreSQL)

| Regla | Descripción |
|-------|-------------|
| **Encapsulamiento de Módulo** | Cada dominio (`auth`, `clientes`, `leads`, `conversaciones`, `ventas`, `comisiones`, `kpis`) debe ser 100% autocontenido. |
| **Aislamiento de Persistencia** | Un módulo tiene **estrictamente prohibido** consultar o modificar la base de datos de otro módulo. Toda comunicación cruzada se realiza exponiendo y consumiendo métodos públicos a través de los **Services**. |
| **Validación Perimetral** | Toda entrada externa de datos (ej. Webhooks de Meta, inputs de ventanilla) debe ser procesada y validada estrictamente por un **DTO** (Data Transfer Object) antes de tocar la lógica de negocio. |
| **Modelo Único** | El archivo `schema.prisma` es la **única fuente de verdad**. No se permite duplicar tipos de datos manuales en archivos externos. |

### 1.2 Frontend (Angular 21+)

| Regla | Descripción |
|-------|-------------|
| **Arquitectura Feature-Driven** | La estructura del frontend debe replicar exactamente la nomenclatura y modularidad del backend por carpetas: `src/app/features/{dominio}/`. |
| **No Invención** | Queda **estrictamente prohibido** generar nuevos estilos inline, clases CSS manuales aisladas o componentes redundantes. Si una interfaz requiere un elemento (ej. tarjeta, botón, tabla, input), la IA debe buscar primero en la librería de componentes atómicos del proyecto (`src/app/shared/`) y reutilizarlo. |
| **Alineación Backend-Frontend** | Los dominios de módulo en frontend corresponden 1:1 con los dominios del backend. No crear carpetas de features que no existan como módulos backend. |

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

### 2.8 HttpClient y httpResource

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

### 2.9 Testing

- Framework de testing: **Vitest** (ya configurado en el proyecto).
- Usar `TestBed` con componentes standalone directamente.
- Usar **Component Harnesses** para interacción robusta con componentes.
- Consultar: `/.agents/skills/angular-developer/references/testing-fundamentals.md`

### 2.10 Convenciones de Nomenclatura y Archivos

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

## 3. Sistema de Diseño e Identidad Visual (Clínica Montalvo)

> Basado estrictamente en el **Tablero de Marca Oficial**. Todos los tokens son **inmutables**.

### 🎨 3.1 Paleta Cromática Exacta

| Token CSS | Hex | Uso |
|-----------|-----|-----|
| `--color-primary` | `#006156` | Fondos de barras de navegación, botones primarios, headers, textos destacados |
| `--color-secondary` | `#39ADA3` | Estados activos, hover, badges informativos, acentos visuales |
| `--color-background` | `#FFFFFF` | Fondo de la aplicación, fondo de tarjetas de contenido |
| `--color-text-dark` | `#1F2937` | Máxima legibilidad tipográfica (texto principal) |
| `--color-text-muted` | `#6B7280` | Subtítulos, etiquetas secundarias |
| `--color-text-critical` | `#000000` | **Restringido** únicamente a elementos de lectura crítica |

> ⚠️ **Regla absoluta:** No se permite inventar colores fuera de esta paleta. Cualquier tono adicional requerido debe derivarse de los primarios usando opacidad (`rgba`) o `color-mix()`.

### 📐 3.2 Geometría y Lenguaje de Formas

El diseño sigue una línea de **"Minimalismo Médico Orgánico y Premium"**. No es un panel empresarial rígido ni un entorno de analítica oscura.

| Elemento | Border Radius | Nota |
|----------|--------------|------|
| **Botones de Acción** | `999px` (píldora) | Siempre redondeados, nunca cuadrados |
| **Inputs y Selects** | `12px` | Suave y orgánico |
| **Tarjetas / Contenedores** | `16px` | Con `box-shadow: 0 4px 20px rgba(0,0,0,0.08)` |
| **Contenedores Orgánicos** | Formas asimétricas | Para máscaras de imágenes o elementos decorativos. Esquinas redondeadas suaves combinadas con ángulos limpios |

### 🔤 3.3 Guía de Fuentes y Tipografía

#### Tipografía Principal: **Poppins**
> Uso: Interfaz, datos, estructura.

| Nivel | Tamaño | Peso |
|-------|--------|------|
| H1 | `48px` | Bold (700) |
| H2 | `36px` | Bold (700) |
| H3 | `28px` | Semibold (600) |
| Texto Base | `16px` | Regular (400) |
| Texto Pequeño | `14px` | Regular (400) |

**Pesos permitidos:** 300, 400, 500, 600, 700.

#### Tipografía Decorativa: **Bufalo** (Script/Handwritten)

> ⛔ **Regla estricta:** Jamás utilizarla para textos de interfaz, etiquetas de botones, tablas de datos, formularios o párrafos informativos. **Solo** se renderiza en textos artísticos de bienvenida o claims de marca.

---

## 4. Protocolo de Reutilización de Componentes (Diseño Atómico)

Para asegurar que el código sea óptimo y escalable, se sigue un enfoque de **Diseño Atómico estricto**:

### 4.1 Átomos (Componentes Puros)

Los botones, inputs, badges de estado, e iconos lineales (Lucide / Heroicons Outline) se definen **una sola vez** en el módulo compartido (`src/app/shared/components/`). **No** se permite volver a escribir etiquetas nativas estilizadas desde cero en vistas finales.

```
src/app/shared/
├── components/
│   ├── button/
│   ├── input/
│   ├── badge/
│   ├── icon/
│   ├── loading-skeleton/
│   └── empty-state/
├── pipes/
├── directives/
└── models/
```

### 4.2 Moléculas (Componentes Compuestos)

Elementos como la barra de búsqueda con filtros integrados o las cajas de mensajes de WhatsApp se ensamblan **exclusivamente** reutilizando los átomos preexistentes.

### 4.3 Organismos (Estructuras Complejas)

Las tablas de leads, el grid del dashboard o el chat en vivo se construyen conectando moléculas. Si la IA detecta que está escribiendo código repetido en dos pantallas distintas, está **obligada** a:

1. **Detenerse**
2. **Extraer** la lógica a un componente reutilizable dentro de `shared/`
3. **Pedir confirmación** al desarrollador

### 4.4 Estructura de Directorios Objetivo

```
src/app/
├── core/                          # Servicios singleton, guards, interceptors
│   ├── auth/
│   │   ├── auth.service.ts
│   │   ├── auth.guard.ts
│   │   └── token.interceptor.ts
│   └── api/
│       └── api.service.ts
├── shared/                        # Átomos, moléculas, pipes, directivas reutilizables
│   ├── components/
│   ├── pipes/
│   ├── directives/
│   └── models/
├── features/                      # Un directorio por dominio de negocio
│   ├── dashboard/
│   │   ├── dashboard.page.ts
│   │   ├── dashboard.page.html
│   │   ├── dashboard.page.css
│   │   ├── dashboard.routes.ts
│   │   └── components/            # Componentes locales del feature
│   ├── leads/
│   ├── clientes/
│   ├── conversaciones/
│   ├── ventas/
│   ├── comisiones/
│   └── kpis/
├── app.ts
├── app.html
├── app.css
├── app.config.ts
└── app.routes.ts
```

---

## 5. Instrucciones de Flujo de Trabajo para la IA

> **Execution & Skills Protocol:** Cuando ejecutes tareas o uses tus habilidades de ingeniería en este repositorio, debes operar bajo los siguientes pasos:

### Paso 1: Análisis de Impacto

Antes de crear código:
- [ ] Lee este manifiesto completo
- [ ] Analiza si tu cambio rompe algún **límite de dominio**
- [ ] Verifica que no introduces un elemento visual fuera de los tokens (`#006156`, `#39ADA3`, `#FFFFFF`, `#1F2937`, `#6B7280`, `#000000`)
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
- [ ] Ejecutar `ng build` después de cada cambio significativo para verificar compilación
- [ ] Todo componente nuevo debe seguir las convenciones de nomenclatura de la Sección 2.10

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

Al iniciar cualquier sesión de desarrollo con IA (Antigravity, Gemini CLI, Copilot, Cursor, o cualquier asistente agéntico), el **primer comando obligatorio** debe ser:

> *"Lee el archivo `CRM_MANIFESTO.md` adjunto en la raíz. Configura tus directivas de comportamiento, habilidades y lógica de generación de código basados estrictamente en sus reglas arquitectónicas, geométrico-visuales y de reutilización atómica. No alteres estas reglas durante toda la vida del desarrollo."*

### Validación de Cumplimiento

La IA debe ser capaz de responder afirmativamente a **todas** estas preguntas antes de escribir código:

1. ¿El cambio respeta los límites de dominio definidos en la Sección 1?
2. ¿Se usan exclusivamente APIs modernas de Angular (Sección 2)?
3. ¿Los colores utilizados pertenecen a la paleta cromática de la Sección 3?
4. ¿Se reutilizaron componentes existentes antes de crear nuevos (Sección 4)?
5. ¿Se siguió el protocolo de ejecución de la Sección 5?

---

> **⚡ Este documento es inmutable.** Cualquier modificación requiere la aprobación explícita del Lead Developer del proyecto Clínica Montalvo.
