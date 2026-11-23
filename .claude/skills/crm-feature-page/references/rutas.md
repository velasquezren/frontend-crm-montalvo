# Rutas

> Parte de la skill `crm-feature-page`: lee antes su [índice](../SKILL.md).

Lazy loading por página en `app.routes.ts`, dentro del layout con `authGuard`:

```ts
{ path: 'clientes', loadComponent: () => import('./features/clientes/clientes.page').then(m => m.ClientesPage) }
```
