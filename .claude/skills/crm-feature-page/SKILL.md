---
name: crm-feature-page
description: Patrón obligatorio para construir o modificar una vista (página) de este CRM Angular — capa de servicios, httpResource, filtros, estados de carga/error/vacío, modales, tiempo real y permisos por rol. Úsalo SIEMPRE al crear o tocar una página bajo src/app/features/, al conectar una vista al backend NestJS, al añadir una llamada HTTP, al abrir un modal, o al ocultar algo según el rol del usuario — incluso para cambios que suenan pequeños ("agrega un filtro", "muestra el total").
---

# Patrón de página de feature

Arquitectura: `CRM_MANIFESTO.md` §1.2 y §4.4. Angular 21 con signals, sin NgModules, sin RxJS para estado de UI.

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

## Servicio de dominio

Dos tipos de método:

```ts
@Injectable({ providedIn: 'root' })
export class ClientesService {
  private readonly api = inject(ApiService);

  // 1) Lectura → devuelve la PETICIÓN, la reactividad vive en la página
  listarRequest(filtro: FiltroClientes): ResourceRequest {
    return this.api.request('/clientes', { busqueda: filtro.busqueda, categoria: filtro.categoria });
  }

  // 2) Comandos → devuelven Promise
  actualizar(id: string, cambios: ActualizarClienteDto): Promise<Cliente> {
    return this.api.patch<Cliente>(`/clientes/${id}`, cambios);
  }
}
```

`ApiService.request()` descarta parámetros vacíos automáticamente: no hace falta armar objetos condicionales.

## Página

```ts
export class ClientesPage {
  private readonly clientesService = inject(ClientesService);
  private readonly toast = inject(ToastService);

  protected readonly filtro = signal<FiltroCategoria>('TODOS');

  protected readonly clientes = httpResource<Cliente[]>(
    () => {
      const filtro = this.filtro();
      return this.clientesService.listarRequest({ categoria: filtro === 'TODOS' ? undefined : filtro });
    },
    { defaultValue: [] },
  );

  protected async guardar(): Promise<void> {
    try {
      await this.clientesService.actualizar(id, cambios);
      this.toast.success('Guardado', 'Listo');
      this.clientes.reload();
    } catch (err) {
      this.toast.error(mensajeDeError(err, 'No se pudo guardar.'), 'Error');
    }
  }
}
```

Reglas:
- `httpResource()` para lecturas reactivas; se re-dispara solo al cambiar un signal leído dentro.
- `signal()` para estado de UI, `computed()` para derivados. **Nunca** `BehaviorSubject`.
- `inject()`, nunca inyección por constructor.
- Tras un comando exitoso: `recurso.reload()`.
- Errores: siempre `mensajeDeError(err, respaldo)` de `core/api/http-error.ts` — nunca `err.error?.message` a mano ni `catch (err: any)`.
- Debounce de búsqueda: `effect(onCleanup => …)` con `clearTimeout` en el `onCleanup` (evita fugas al destruir).

## Plantilla: los 4 estados obligatorios

Toda vista con datos remotos cubre carga, error, vacío y contenido:

```html
@if (clientes.isLoading()) {
  <app-loading-skeleton shape="text" height="2.5rem" />
} @else if (clientes.error()) {
  <app-empty-state icon="alert-circle" title="No se pudo cargar…"
    description="Verifica que el servidor esté encendido." />
} @else if (clientes.value().datos.length > 0) {
  <app-table>…</app-table>
  <app-paginator
    [pagina]="clientes.value().pagina"
    [totalPaginas]="clientes.value().totalPaginas"
    [total]="clientes.value().total"
    [limite]="clientes.value().limite"
    (cambiar)="pagina.set($event)" />
} @else {
  <app-empty-state icon="users" title="Sin resultados" description="…" />
}
```

**El estado de error no es opcional, y el build lo comprueba.** Faltaba en seis de las doce
vistas, y su ausencia no se veía como un hueco sino como una **mentira**: sin esa rama, un
backend caído cae en el `@empty` y la pantalla afirma "no hay clientes" o "no hay comisiones".
El agente lo lee como un dato —"hoy no hay nada"— y cierra. En desarrollo no se nota porque el
servidor siempre responde.

Se resuelve con el átomo, no maquetando el bloque en cada vista:

```html
@if (clientes.isLoading()) {
  <app-loading-skeleton … />
} @else if (clientes.error()) {
  <app-error-carga que="los clientes" (reintentar)="clientes.reload()" />
} @else if (clientes.value().datos.length > 0) {
  …
} @else {
  <app-empty-state … />
}
```

El orden importa: el error va **antes** de comprobar si hay datos, porque cuando la petición
falla el recurso devuelve su `defaultValue` —una página vacía— y caería en el estado vacío.

`npm run check:skills` falla si una vista usa `httpResource` y su plantilla no declara error.

Todo listado paginado llega envuelto en `RespuestaPaginada<T>` (`core/api/pagination.model.ts`):
usa `.value().datos`, nunca `.value()` a secas — ya no es un array plano. Cambiar de filtro o de
búsqueda vuelve la página a 1 (si no, el usuario queda "atrapado" en una página que ya no existe
para el nuevo filtro).

Control de flujo: `@if` / `@for` (siempre con `track`) / `@switch` / `@empty`. Prohibido `*ngIf` y `*ngFor`.

## Modales: `DialogService` (CDK Overlay), nunca `@if` con `position: fixed`

Los modales se proyectan a `document.body` con Angular CDK Overlay, no con un `@if` en la propia
plantilla — así el backdrop cubre el viewport completo sin pelear con `overflow`/`z-index` de
contenedores padres.

```ts
private readonly dialogService = inject(DialogService);
private readonly vcr = inject(ViewContainerRef);
private activeOverlayRef?: OverlayRef;

abrirEdicion(cliente: Cliente, template: TemplateRef<unknown>): void {
  this.clienteSeleccionado.set(cliente);
  this.activeOverlayRef?.dispose();               // por si había otro modal abierto
  this.activeOverlayRef = this.dialogService.openTemplate(template, this.vcr);
}

cerrarEdicion(): void {
  this.activeOverlayRef?.dispose();
  this.activeOverlayRef = undefined;
}
```

```html
<ng-template #modalEditar>
  <div class="pointer-events-auto ...">…contenido del modal, usando los mismos signals…</div>
</ng-template>
```

### Al abrir un modal, deriva los datos en memoria — no dispares otra petición

El registro que el usuario acaba de tocar **ya está en el listado que cargaste**. Resuelve el
contenido del modal con `computed()` sobre el ítem seleccionado en vez de pedir el detalle al
servidor: un spinner al abrir una ficha que ya tenías en pantalla se siente lento y roto.

Reserva la petición para lo que de verdad no tienes (el historial completo de un chat, por
ejemplo), y muéstralo *dentro* del modal ya abierto, no como bloqueo previo a abrirlo.

**No hace falta implementar `OnDestroy` para evitar fugas**: `DialogService.openTemplate()` ya
registra la limpieza en el `DestroyRef` del componente dueño del `ViewContainerRef` — si el usuario
navega a otra vista con el modal abierto sin cerrarlo, el overlay se destruye solo. Antes de esto,
dos páginas dejaban un fondo oscuro huérfano bloqueando clics en la siguiente vista; ahora es
imposible que un nuevo modal reintroduzca ese bug, sin importar si la página se acuerda de limpiar.

## Rendimiento: el cuello de botella es la RED, no las consultas

Medido contra producción el 2026-08-05, desde Bolivia:

| | |
|---|---|
| Consulta en el servidor | **6-27 ms** |
| Ida y vuelta con conexión abierta | **~190 ms** |
| Handshake TLS (primera petición) | **~385 ms** |

O sea que en una navegación **el 97% del tiempo es red**. Antes de optimizar una
consulta de Prisma, comprueba que sea ella la lenta: casi nunca lo es. Lo que se
nota es **no hacer la petición**.

De ahí dos decisiones que ya están tomadas y conviene no deshacer:

**1. `provideAppInitializer` no espera a la red.** La sincronización de rol se
dispara sin `return` (`app.config.ts`): devolver la promesa dejaba la pantalla en
blanco ~575 ms en cada carga y en cada F5, porque Angular no arranca hasta que el
initializer resuelve. Ahora pinta de inmediato y la comprobación termina después;
si el rol cambió, cierra la sesión igual. El medio segundo de menú de más no es
un agujero: el backend responde 403 igualmente.

**2. Los datos de REFERENCIA se cachean 60 s** en `core/api/cache.interceptor.ts`.
`/planilla-comisiones/periodos` lo pedían tres servicios distintos, así que cada
salto a Servicios, Planilla o Reportes lo volvía a traer.

**Solo entra ahí lo que cambia al importar o configurar algo** (periodos,
configuración, vendedoras, demografía). **Nunca** clientes, leads, ventas,
conversaciones ni KPIs: una respuesta vieja de esos es un dato equivocado en
pantalla, y eso vale más que 190 ms. Cualquier escritura (POST/PATCH/PUT/DELETE)
vacía la caché entera antes de salir, y `logout()` también — en la clínica varias
agentes comparten el mismo equipo.

Si añades un endpoint a esa lista, pregúntate qué se ve si llega un minuto tarde.
Si la respuesta incomoda, no va.

**La coincidencia es por ruta EXACTA, no por prefijo** (`esDeReferencia()`).
Hasta el 2026-08-28 era `url.includes(ruta)`, e `includes` no distingue una
colección de sus hijos: `/planilla-comisiones/periodos` casaba también con
`/periodos/:id/ventas`, `/alertas`, `/reporte/consolidado`, `/revision` y hasta
con el `/exportar` que devuelve el Excel. Todos ellos son operación del día —lo
que esta misma lista declara que NO entra— y se servían hasta un minuto tarde.

Cuesta verlo porque cualquier escritura vacía la caché entera: trabajando solo
casi nunca sale nada viejo. **Se nota cuando el cambio lo hace otra persona**,
que es la situación normal en la clínica. El caso real: dos SUPER_ADMIN
revisando el mismo mes, uno aprueba y el otro sigue viendo "falta su firma" con
el botón de aprobar puesto sobre un mes ya cerrado. Lo fija
`cache.interceptor.spec.ts`.

## Tiempo real: `RealtimeService` en vez de polling ciego

Un `setInterval` que recarga todo cada N segundos, siempre, haya o no algo
nuevo, es el último recurso — no el primero. Para vistas que reciben cambios
de otro actor (el inbox de Conversaciones recibiendo mensajes de WhatsApp),
usa `RealtimeService` (`core/realtime/realtime.service.ts`): un socket
compartido por sesión que expone `actividad` como signal, y que se conecta
igual que `DialogService` se abre — con auto-limpieza por `DestroyRef`, sin
`OnDestroy` manual.

```ts
constructor() {
  this.realtimeService.conectar(inject(DestroyRef));

  effect(() => {
    const aviso = this.realtimeService.actividad();
    if (!aviso) return;
    this.conversaciones.reload();               // solo lo que puede haber cambiado
    if (this.seleccionadaId() === aviso.conversacionId) {
      this.detalle.reload();
    }
  });
}
```

El aviso del socket **nunca lleva datos del paciente** — solo un id. El dato
real siempre se trae por el `httpResource` normal, que es el que respeta el
escopado por rol del backend. Deja un polling de respaldo mucho más largo
(60s, no 15s) como red de seguridad si el socket se cae, no como mecanismo principal.

## Envío optimista: no esperes el round-trip para mostrar el resultado

Si una acción del usuario tiene un resultado predecible (mandar un mensaje de
chat), actualiza el `httpResource` local con `.set(...)` **antes** de que
resuelva la petición, y revierte con el valor previo si falla:

```ts
const chatPrevio = this.detalle.value();
this.detalle.set({ ...chatPrevio, mensajes: [...chatPrevio.mensajes, mensajeOptimista] });

try {
  await this.conversacionesService.enviarMensaje(id, texto);
  this.detalle.reload(); // reconcilia con el id/timestamp real del servidor
} catch (err) {
  this.detalle.set(chatPrevio); // rollback: la burbuja optimista desaparece
  this.mensajeNuevo.set(texto); // el agente no pierde lo que escribió
}
```

Nunca lo uses para acciones cuyo resultado el servidor pueda rechazar de forma
no obvia para el usuario (crear con validación de negocio compleja, montos,
etc.) — ahí sí conviene esperar la respuesta antes de reflejar el cambio.

## Autenticación: refresh silencioso ante un 401, con freno anti-bucle

`token.interceptor.ts` adjunta el JWT a cada petición. Ante un 401 que **no**
venga de `/auth/login`, `/auth/refresh` ni `/auth/logout`
(`esPeticionDeAutenticacion` los excluye — si no, cerrar sesión podría
resucitarla), intenta UN refresco silencioso vía `AuthService.refrescarToken()`
y reintenta la petición original con el token nuevo. Solo desloguea y manda a
`/auth/login` si:

- el refresco en sí falla (el `refresh_token` de 30 días también venció), o
- la petición reintentada con el token **nuevo** vuelve a dar 401 — ahí el
  problema no es el token, es la sesión (usuario desactivado, permisos
  revocados), y sin este freno la agente quedaba en una pantalla que fallaba
  en bucle sin explicación.

**`refrescarToken()` deduplica con una promesa compartida** (`AuthService`,
campo `refrescoEnCurso`): si varias peticiones reciben 401 a la vez —típico al
volver de segundo plano con el `access_token` ya vencido—, todas esperan el
MISMO refresco en vuelo en vez de disparar N peticiones a `/auth/refresh` para
pedir, todas, lo mismo. Ver `crm-backend-module` (repo del backend) para el
otro lado: por qué la cookie es `SameSite=None` en producción y qué hace
`logout()` de verdad.

## Roles y permisos

Hay tres roles jerárquicos: `AGENTE` < `ADMIN` < `SUPER_ADMIN`. La jerarquía vive en
`core/auth/roles.ts` y es espejo de `common/auth/roles.ts` del backend — **si añades un rol,
tócalo en los dos lados**.

El **backend** es la autoridad: acota por rol según el JWT y bloquea con `@Roles`.
El frontend solo *oculta* lo que no aplica:

- `authService.isAdmin()` / `isSuperAdmin()` para mostrar u ocultar acciones.
- `exigeRol('ADMIN')` o `exigeRol('SUPER_ADMIN')` como `canActivate` de la ruta.
- `rolMinimo` en `NAV_ITEMS` para ocultar la entrada del sidebar.

```ts
{ path: 'agentes', canActivate: [exigeRol('SUPER_ADMIN')], loadComponent: … }
```

`exigeRol` sustituyó a los guards por rol, que eran el mismo archivo copiado cambiando una
comparación: cada copia era un lugar más donde olvidar un rol nuevo. Por eso **no escribas un
guard de rol a mano** — usa la fábrica.

Como la comparación es por **rango mínimo**, pedir `ADMIN` deja pasar también al `SUPER_ADMIN`
sin enumerarlo. Nunca compares `rol === 'ADMIN'` a mano: eso deja fuera al super admin y es
exactamente el bug que la jerarquía existe para prevenir. Mismo error, versión
"mostrar texto": para pintar el rol como etiqueta (no para decidir acceso), usa
`ROL_LABEL[rol]`, nunca un `if`/`switch` a mano — una comparación manual ahí
dejó una vez a un SUPER_ADMIN etiquetado como "Agente" en pantalla.

Ocultar en el frontend nunca es suficiente: si un endpoint nuevo es sensible, verifica que el
backend también lo restrinja. Al revés también rompe: `/desempeno-agentes` quedó sin
`canActivate` un tiempo —el backend restringía bien, pero la ruta era visible para
cualquier rol— y un agente que entraba ahí veía una pantalla en blanco con cada
petición cayendo en 403 suyo, sin ninguna pista de qué había pasado. Toda ruta
sensible necesita su guardia en `app.routes.ts` aunque el backend ya la
proteja: la protección del backend evita la fuga de datos, no la pantalla rota.

## Rutas

Lazy loading por página en `app.routes.ts`, dentro del layout con `authGuard`:

```ts
{ path: 'clientes', loadComponent: () => import('./features/clientes/clientes.page').then(m => m.ClientesPage) }
```

## Antes de dar por terminado

- `npx ng build` sin errores (**no uses el navegador en este proyecto**).
- Reutilizaste átomos de `shared/components/` en vez de HTML suelto — inventario y paleta en
  el skill `crm-design-system`.
- Los 4 estados (carga / error / vacío / contenido) están cubiertos.
- Ningún hex nuevo, ningún `any`, ningún `console.log`, ningún `rol === '…'` a mano.

## Mantenimiento

`npm run check:skills` contrasta los datos de este archivo con el código (rutas citadas,
selectores, roles declarados en `core/auth/roles.ts`) y va encadenado a `npm run build`.

Verifica **datos, no criterio**: los patrones y el porqué de cada decisión se actualizan a mano.
Cuando el validador te contradiga, corrige el skill — el código es la verdad.
