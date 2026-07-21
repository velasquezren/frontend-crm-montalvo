---
name: crm-feature-page
description: Patrón obligatorio para construir o modificar una vista (página) de este CRM Angular — capa de servicios, httpResource, filtros, estados de carga/error/vacío y manejo de errores. Úsalo al crear una página nueva bajo src/app/features/, al conectar una vista al backend NestJS, o al añadir una llamada HTTP.
---

# Patrón de página de feature

Arquitectura: `CRM_MANIFESTO.md` §1.2 y §4.4. Angular 21 con signals, sin NgModules, sin RxJS para estado de UI.

## Regla de oro

**Una página NUNCA inyecta `HttpClient` ni construye URLs.**
Cada dominio tiene su servicio en `features/<dominio>/<dominio>.service.ts`, que se apoya en
`core/api/api.service.ts`. Si añades un endpoint, va al servicio del dominio, no a la página.

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
} @else if (clientes.value().length > 0) {
  <app-table>…</app-table>
} @else {
  <app-empty-state icon="users" title="Sin resultados" description="…" />
}
```

Control de flujo: `@if` / `@for` (siempre con `track`) / `@switch` / `@empty`. Prohibido `*ngIf` y `*ngFor`.

## Roles y permisos

El **backend** es la autoridad: acota por rol según el JWT y bloquea con `@Roles`.
El frontend solo *oculta* lo que no aplica:

- `authService.isAdmin()` para mostrar/ocultar acciones de admin.
- `adminGuard` en la ruta para vistas exclusivas de admin.
- `soloAdmin: true` en `NAV_ITEMS` para ocultarlas del sidebar.

Nunca asumas que ocultar en el frontend es suficiente: si un endpoint nuevo es sensible, verifica que el backend también lo restrinja.

## Rutas

Lazy loading por página en `app.routes.ts`, dentro del layout con `authGuard`:

```ts
{ path: 'clientes', loadComponent: () => import('./features/clientes/clientes.page').then(m => m.ClientesPage) }
```

## Antes de dar por terminado

- `npx ng build` sin errores (**no uses el navegador en este proyecto**).
- Reutilizaste átomos de `shared/components/` en vez de HTML suelto.
- Ningún hex nuevo, ningún `any`, ningún `console.log`.
