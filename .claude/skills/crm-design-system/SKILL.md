---
name: crm-design-system
description: Sistema de diseño e inventario de componentes atómicos de este CRM. Úsalo ANTES de escribir cualquier HTML/CSS de una vista, de elegir un color, de crear un botón/input/tabla/badge, o de añadir un ícono. Evita reinventar componentes que ya existen y colores fuera de la paleta cerrada.
---

# Sistema de diseño del CRM

Fuente de verdad: `CRM_MANIFESTO.md` §3 y §4. Los tokens viven en `src/styles.css` (`@theme` de Tailwind v4).

## Regla de oro

**Nunca escribas un `<button>`, `<input>`, `<table>` o badge a mano.** Existe un átomo para cada uno en
`src/app/shared/components/`. Si necesitas algo que no existe, extiende el átomo con un `input()` nuevo
antes de crear un componente duplicado.

## Paleta (cerrada — no inventar colores)

| Token Tailwind | Hex | Uso |
|---|---|---|
| `primary` | `#006156` | Botones primarios, activos, acentos |
| `secondary` | `#39ADA3` | Hover, barras secundarias, indicadores |
| `bg-light` | `#EAF7F5` | Fondos suaves, chips, estado activo |
| `bg-workspace` | `#F8F9FA` | Fondo del área de trabajo |
| `text-dark` | `#1F2937` | Texto principal |
| `text-muted` | `#6B7280` | Texto secundario |
| `border` | `#E5E7EB` | Bordes sutiles |

Cualquier tono adicional se **deriva** con `color-mix()` en `styles.css`, nunca se escribe un hex nuevo en un componente.

### Estados semánticos

No hay rojo/ámbar de alarma: es intencional (línea "premium médico" calmada). Los estados reutilizan la paleta:

- `success` = primary · `info` = secondary · `neutral` = text-muted · `critical` = negro (no rojo)

Cada uno tiene su par `-bg`. Se consumen **solo** vía el átomo `<app-badge variant="…">`.

## Geometría

- Botones: `rounded-full` (píldora) — siempre
- Inputs: `rounded-xl` (12px)
- Tarjetas: `rounded-2xl` (16px) + `shadow-subtle`
- Sombras: solo `shadow-subtle` y `shadow-lifted`. Prohibido glassmorphism o sombras pesadas.

## Tipografía

Poppins. Jerarquía: H1 48 / H2 36 / H3 28 / base 16 / small 14.

## Inventario de átomos (`src/app/shared/components/`)

| Componente | Selector | Inputs principales |
|---|---|---|
| Button | `<app-button>` | `variant` (primary/secondary/ghost), `size`, `icon`, `loading`, `fullWidth`, `circle`, `type` |
| Input | `<app-input>` | `label`, `type` (incl. password con toggle), `placeholder`, `error`, `[(value)]` |
| Badge | `<app-badge>` | `variant` (success/info/neutral/critical), `icon` |
| Card | `<app-card>` | `padding` (sm/md/lg), `hoverable` |
| Avatar | `<app-avatar>` | `initials`, `size` (sm/md/lg), `variant` (light/solid) |
| Icon | `<app-icon>` | `name` (catálogo cerrado), `size`, `strokeWidth` |
| EmptyState | `<app-empty-state>` | `icon`, `title`, `description` + contenido proyectado |
| LoadingSkeleton | `<app-loading-skeleton>` | `shape`, `width`, `height` |
| PageHeader | `<app-page-header>` | `title`, `subtitle` + acciones proyectadas |
| FilterChip | `<app-filter-chip>` | `active`, `count`, `size`, `(clicked)` |
| Table | `<app-table>` | proyecta `<thead>`/`<tbody>` nativos |
| FabMenu | `<app-fab-menu>` | `items` — acciones rápidas flotantes (vive en el layout) |

### Íconos

`IconName` en `icon.component.ts` es un **catálogo cerrado** (estilo Lucide, outline, stroke 2).
Para usar uno nuevo: añade el `@case` con el path del SVG y su nombre al tipo `IconName`.
Nunca pegues un `<svg>` suelto en una vista.

## Helpers compartidos

- `moneda.pipe.ts` → `{{ monto | moneda }}` o `formatearBs(n)`. **Moneda del sistema: Bs (es-BO).** Nunca formatees montos a mano.
- `generarIniciales(nombre)` en `core/auth/user.model.ts` → iniciales para avatares.
- `shared/models/estados.model.ts` → etiquetas y variantes de badge de Lead/Venta/Comisión.
- `shared/models/cliente-categoria.model.ts` → Gold/Silver/Bronze/Prospecto.

## Marca

El proyecto es **agnóstico de marca**: no inventes logo, isotipo ni iniciales.
El slot del logo (topbar, login) queda vacío hasta que el cliente entregue el suyo.
