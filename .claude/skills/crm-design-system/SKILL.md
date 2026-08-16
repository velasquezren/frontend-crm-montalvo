---
name: crm-design-system
description: Sistema de diseño, paleta cerrada e inventario de componentes atómicos de este CRM Angular. Úsalo SIEMPRE antes de escribir HTML o CSS de una vista, elegir un color, maquetar un modal, o crear un botón, input, tabla, badge, gráfico o ícono — incluso si el pedido suena trivial ("agrega un botón", "ponle un borde rojo", "un chart de ventas"). Evita reinventar componentes que ya existen, hexadecimales fuera de la paleta y SVGs sueltos en las plantillas.
---

# Sistema de diseño del CRM

Tokens reales: `src/styles.css` (bloque `@theme` de Tailwind v4). Racional de marca: `CRM_MANIFESTO.md` §3.

> Las tablas de abajo son una copia de consulta rápida. **Si alguna vez discrepan con
> `styles.css` o con el `.component.ts` del átomo, gana el código** — y aprovecha para
> corregir este archivo en el mismo commit. Este skill ya se desincronizó una vez; las
> reglas envejecen bien, las tablas de datos no. Por eso `npm run check:skills` las
> compara con el código y falla si mienten (ver *Mantenimiento* al final).

## Regla de oro

**No escribas a mano un `<button>`, `<input>`, `<table>` ni un badge.** Existe un átomo para
cada uno en `src/app/shared/components/`. Si necesitas una variante que no existe, agrégale un
`input()` al átomo — un componente duplicado con "casi lo mismo" es cómo se pierde la coherencia
visual, porque después solo uno de los dos recibe los arreglos.

## Paleta (cerrada — no inventar hexadecimales)

| Token Tailwind | Hex | Uso |
|---|---|---|
| `primary` | `#006156` | Botones primarios, estados activos, acentos |
| `secondary` | `#39ADA3` | Hover, barras secundarias, indicadores |
| `bg-light` | `#EAF7F5` | Fondos suaves, chips, estado activo |
| `bg-workspace` | `#F8F9FA` | Fondo del área de trabajo |
| `background` | `#FFFFFF` | Superficies (tarjetas, modales, tablas) |
| `text-dark` | `#1F2937` | Texto principal |
| `text-muted` | `#6B7280` | Texto secundario |
| `text-critical` | `#000000` | Texto de estado crítico |
| `border` | `#E5E7EB` | Bordes sutiles |

Cualquier tono adicional se **deriva** con `color-mix()` dentro de `styles.css`; nunca se escribe
un hex nuevo en un componente.

### Estados semánticos

No hay rojo ni ámbar de alarma, y es deliberado: la línea es "premium médico" calmada. Los estados
reutilizan la paleta base, cada uno con su par `-bg`:

- `success` = primary · `info` = secondary · `neutral` = text-muted · **`critical` = negro, no rojo**

Se consumen **solo** vía `<app-badge variant="…">`. Si una vista necesita un rojo de alerta,
eso es un cambio de identidad visual: consúltalo antes de introducirlo, no lo resuelvas con un
hex local.

## Geometría y superficie

- Botones: `rounded-full` (píldora) — siempre
- Inputs: `rounded-xl` (12px) · Tarjetas y modales: `rounded-2xl` (16px)
- Sombras: solo `shadow-subtle` y `shadow-lifted`
- **Glassmorphism (`backdrop-blur`): solo en capas que flotan *sobre* el contenido** — el toast y
  los backdrops de overlay. Nunca en tarjetas, tablas ni superficies de contenido, donde compite
  con la legibilidad de los datos clínicos.

## Filosofía de Diseño: Minimalismo y Densidad Fluida (Estilo Conversaciones)

- **Cero íconos gigantes ni cajas decorativas artificiales**: Los íconos en listados, barras de herramientas y estados vacíos miden entre 12px y 16px, integrados con el texto.
- **Layout fluido a pantalla completa**: Las secciones ocupan el 100% del ancho del layout sin tarjetas estrechas centradas que dejen márgenes vacíos a los lados.
- **Alta densidad de información**: Filas compactas (padding 10-12px), bordes sutiles `border-border`, badges sobrios y acciones en píldora compacta (`size="sm"`).
- **Consistencia en Informes y Gráficos**: Las tablas de datos y gráficos analíticos mantienen su diseño limpio y estructurado sin añadir elementos ornamentales de IA.

## Tipografía y números

Poppins. Jerarquía: H1 48 / H2 36 / H3 28 / base 16 / small 14.

**Montos, teléfonos, fechas y cualquier número en columna van con `tabular-nums`** (ya viene en
`<app-table>` y en los charts). Sin ancho fijo por dígito, las cifras bailan al cambiar de fila y
una tabla de comisiones se vuelve incómoda de escanear.

## Animación

Clases utilitarias definidas en `styles.css` — úsalas en vez de escribir `@keyframes` nuevos:

| Clase | Para |
|---|---|
| `animate-modal-pop` | Apertura de modales y popovers |
| `animate-fade-scale` | Aparición suave de paneles |
| `animate-toast-slide` | Entrada del toast |
| `animate-drawer-in` | Entrada de un cajón lateral (historial, perfil del médico) |

Un cajón entra **desde su borde**, no desde el centro: `animate-fade-scale` lo hacía
brotar del medio de la pantalla, que no dice de dónde viene ni hacia dónde se cierra.

Curvas: `--ease-spring-smooth`, `--ease-spring-bounce`, `--ease-press`. Para hover y transiciones
simples, `transition-all duration-200`.

**Gráficos y bloques pesados bajo el pliegue van en `@defer (on viewport)`**, con un
`<app-loading-skeleton>` de **altura exacta** en el `@placeholder`. Si el esqueleto mide distinto
que el contenido real, la página salta al cargar (CLS) y se siente barata. Ver
`reportes.page.html` y `ventas.page.html`.

## Inventario de átomos (`src/app/shared/components/`)

| Componente | Selector | API |
|---|---|---|
| Button | `<app-button>` | `variant` (primary/secondary/ghost), `size`, `type`, `icon`, `loading`, `disabled`, `fullWidth`, `circle` · `(clicked)` |
| Input | `<app-input>` | `label`, `type` (incl. password con toggle), `placeholder`, `autocomplete`, `error`, `disabled` · `[(value)]` |
| Badge | `<app-badge>` | `variant` (success/info/neutral/critical), `icon` |
| Card | `<app-card>` | `padding` (sm/md/lg), `hoverable` |
| KpiCard | `<app-kpi-card>` | `label`, `valor` (requeridos; número → lo formatea el átomo), `icon`, `tono` (primary/secondary/neutral/critical), `tonoValor`, `destacado`, `compacto`, `pie`, `pieIcono` + contenido proyectado |
| Avatar | `<app-avatar>` | `initials` (requerido), `size`, `variant` (light/solid), `imageUrl` |
| Icon | `<app-icon>` | `name` (catálogo cerrado), `size`, `strokeWidth` |
| EmptyState | `<app-empty-state>` | `icon`, `title` (requerido), `description` + contenido proyectado |
| ErrorCarga | `<app-error-carga>` | `que` ("los clientes"), `titulo`, `descripcion` · `(reintentar)` — estado de error de una vista con datos remotos |
| LoadingSkeleton | `<app-loading-skeleton>` | `shape`, `width`, `height` |
| PageHeader | `<app-page-header>` | `title` (requerido), **`subtitle`** + acciones proyectadas |
| FilterChip | `<app-filter-chip>` | `active`, `count`, `size` · `(clicked)` |
| Table | `<app-table>` | `dense`, `maxHeight` — proyecta `<thead>`/`<tbody>` nativos |
| ThOrdenable | `th[appOrdenable]` | `appOrdenable` (columna, requerido), `orden`, `direccion`, `direccionInicial` · `(ordenar)` — cabecera ordenable; **ordena el servidor**, no el cliente |
| Paginator | `<app-paginator>` | `pagina`, `totalPaginas`, `total` (requeridos), `limite` · `(cambiar)` |
| BarChart | `<app-bar-chart>` | `items`, `mode` (BAR/COLUMN), `title`, `subtitle`, `height`, `formatType` |
| DonutChart | `<app-donut-chart>` | `items`, `title`, `subtitle`, `etiquetaTotal`, `formatType` |
| InfoHint | `<app-info-hint>` | `titulo` (requerido), `size` + contenido proyectado — el "!" que explica una regla |
| SelectorPeriodoEmpty | `<app-selector-periodo-empty>` | `periodos`, `cargando`, `titulo`, `descripcion`, `icono`, `puedeImportar` · `(periodoSeleccionado)`, `(importarClic)`, `(archivoSeleccionado)` |
| DialogService | *(servicio)* | `openTemplate(tpl, vcr)` — modales por CDK Overlay, ver `crm-feature-page` |

### Uso típico

```html
<app-page-header title="Clientes y Pacientes" subtitle="Gestión integral de contactos.">
  <app-button icon="plus" (clicked)="abrirCreacion()">Nuevo</app-button>
</app-page-header>

<app-filter-chip [active]="filtro() === 'GOLD'" [count]="totalGold()" (clicked)="cambiarFiltro('GOLD')">
  Gold (VIP)
</app-filter-chip>

<app-table [dense]="true" maxHeight="calc(100dvh - 220px)">
  <thead>
    <tr><th class="text-left">Paciente</th><th class="text-right">Monto</th></tr>
  </thead>
  <tbody>
    @for (venta of ventas(); track venta.id) {
      <tr>
        <td class="text-left">{{ venta.cliente.nombre }}</td>
        <td class="text-right">{{ venta.monto | moneda }}</td>
      </tr>
    }
  </tbody>
</app-table>

<app-button variant="primary" icon="user-plus" [loading]="guardando()" (clicked)="guardar()">
  Guardar Registro
</app-button>
```

## Íconos: catálogo cerrado, cero emojis

`IconName` en `icon.component.ts` es un catálogo cerrado (estilo Lucide, outline, stroke 2).
Para usar uno nuevo: añade el `@case` con el path del SVG y su nombre al tipo `IconName`.

- **Nunca pegues un `<svg>` suelto** en una vista — se escapa del catálogo y del tamaño/stroke coherentes.
- **Nunca uses emojis** en etiquetas, botones, títulos ni modales. Renderizan distinto en cada
  sistema operativo y rompen el tono clínico; el ícono vectorial es la única fuente de simbología.
  *(Esta regla aplica a la interfaz. Los emojis en documentación como este archivo están bien.)*

## Al partir una página en subcomponentes, el CSS viaja con su HTML

Los componentes usan encapsulación `Emulated`: Angular marca los elementos de
*cada* plantilla con un atributo propio y acota su CSS a ese atributo. Por eso,
al mover un bloque de HTML a un subcomponente, **el CSS del padre deja de
aplicarle** — y la página se queda sin estilos sin que nada avise.

Ninguna compuerta lo detecta: `check:tipos`, `check:skills` y `npm run build`
pasan en verde sobre una vista rota, porque el problema no es de tipos ni de
sintaxis, es de a qué elemento le llega la regla.

**Al terminar un refactor así, comprueba que ningún selector quede definido en un
archivo y usado solo en otro.** Es lo único que atrapa el fallo.

### Si la misma clase la necesitan dos o tres plantillas, es un átomo

Copiar el bloque de CSS a cada subcomponente *funciona* — es el precio de la
encapsulación — pero es la señal de que ese pedazo de interfaz ya no pertenece a
una vista. Al partir `features/servicios` quedaron tres plantillas maquetando a
mano la misma tarjeta de KPI, cada una con su copia de `.kpi-card`, `.kpi-icono`
y sus variantes.

Cuando eso pase, extrae un átomo a `shared/components/` en vez de repartir
copias: una sola definición, un solo lugar donde cambiarla, y el resto de las
vistas lo hereda gratis.

## Helpers compartidos

- `moneda.pipe.ts` → `{{ monto | moneda }}` o `formatearBs(n)`. **Moneda del sistema: Bs (es-BO).**
  Nunca formatees montos a mano.
- `generarIniciales(nombre)` en `core/auth/user.model.ts` → iniciales para avatares.
- `shared/models/estados.model.ts` → etiquetas y variantes de badge de Lead/Venta/Comisión.
- `shared/models/cliente-categoria.model.ts` → Gold/Silver/Bronze/Prospecto.
- `core/api/db-enums.ts` → enums espejo de Prisma, **generados** por `tools/generar-db-enums.mjs`.
  No los edites a mano: se regeneran desde `schema.prisma`.

## Marca

El proyecto es **agnóstico de marca**: no inventes logo, isotipo ni iniciales. El slot del logo
(topbar, login) queda vacío hasta que el cliente entregue el suyo.

## Mantenimiento

```bash
npm run check:skills
```

Contrasta este archivo con el código: hexadecimales contra los tokens de `styles.css`, cada
`input`/`output` de la tabla de inventario contra el `.component.ts` del átomo, los selectores
`<app-…>`, las clases `animate-…` y las rutas citadas. Va encadenado a `npm run build`.

### Tres reglas dejaron de ser recomendación: el build falla si las rompes

Desde el 2026-08-04 el validador mira también en la dirección contraria — **que el código no
rompa lo que este archivo declara ley**:

| Regla | Qué rechaza |
|---|---|
| Paleta cerrada | cualquier utilidad `bg-/text-/border-…-{amber,red,slate,emerald,…}-NNN` en un `.html` |
| Sombras | cualquier `shadow-{xs,sm,md,lg,xl,2xl,inner}`; solo valen `subtle` y `lifted` |
| Radios | cualquier `border-radius` que no sea 12px (inputs), 16px (tarjetas) o píldora |
| Hexadecimales | cualquier `#rrggbb` ajeno a los nueve de la paleta, en `.css` **y en `.ts`** |

Existe porque el inbox había acumulado **17 desviaciones** —una escala ámbar completa donde la
paleta excluye ámbares a propósito, cinco sombras ajenas, ocho radios distintos— sin que nada
avisara. Una vista no se sale del sistema de golpe: se sale de una clase en una clase.

La deuda de utilidades, sombras y radios está pagada: toda la app respeta la paleta, las dos
sombras y los tres radios. El mecanismo de `DEUDA` en `tools/verificar-skills.mjs` congela lo
que aún no se puede arreglar: se anota el número por archivo y a partir de ahí **solo puede
bajar** —arreglar obliga a actualizar la cifra, empeorar rompe el build—.

**Hay una entrada abierta**, desde que la regla de hexadecimales se extendió a los `.ts`
(2026-08-11): `ORIGEN_COLOR` en `dashboard.page.ts` pinta cada canal con su color de marca
—teal de WhatsApp, azul de Facebook, violeta de Instagram— para distinguir nueve orígenes en
un gráfico. No es descuido: la paleta cerrada ofrece tres tonos usables y con tres ese gráfico
deja de leerse. Resolverlo es una decisión de identidad visual (aceptar los colores de canal
como excepción, o distinguir por etiqueta directa en vez de por color), no una limpieza, y
está pendiente de decidir. Mientras tanto la cifra está congelada en 12.

Lo que se arregló, por si sirve de guía: los estados de lead estaban pintados a mano con
escalas inventadas (sky/amber/emerald) mientras la tabla de la misma pantalla usaba
`ESTADO_LEAD_BADGE`, así que un lead "Convertido" era de dos verdes distintos a la vez. La
regla práctica: **si estás eligiendo un color para un estado, ya existe su variante** en
`shared/models/estados.model.ts`.

Verifica **datos, no criterio**: si añades una regla o cambias un patrón, este archivo se
actualiza a mano. Cuando el validador te contradiga, corrige el skill — el código es la verdad.
