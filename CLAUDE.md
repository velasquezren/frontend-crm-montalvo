# CRM Clínica Montalvo — frontend

Interfaz del CRM de una clínica estética en Bolivia. Angular 21 con signals,
Tailwind v4, PWA. Desplegado en Vercel.

La usan agentes de venta reales durante su jornada, muchas veces desde el móvil y
con una conexión mediocre. **No hay staging**: lo que se despliega es lo que ve la
clínica.

## Dónde está todo

Dos repositorios hermanos bajo el mismo directorio padre:

```
CRM/
├── backend-crm-montalvo/    ← NestJS + Prisma; la autoridad de permisos y datos
└── frontend-crm-montalvo/   ← estás aquí
```

`CRM_MANIFESTO.md` (en este repo) es la referencia de arquitectura y marca.

## Antes de escribir código

Dos skills, y casi cualquier cambio necesita los dos:

- **`crm-feature-page`** — antes de tocar una vista, añadir una llamada HTTP, abrir
  un modal u ocultar algo por rol.
- **`crm-design-system`** — antes de escribir HTML o CSS, elegir un color o crear
  cualquier control.

Documentan **cicatrices**, no teoría. Si una regla parece excesiva, probablemente
estás a punto de reintroducir el bug que la motivó.

## Comandos

```bash
npm start              # ng serve
npm run build          # check:tipos + check:skills + ng build — la compuerta real
npm run sync:tipos     # regenera db-enums.ts desde el schema.prisma del backend
```

**No uses el navegador en este proyecto.** La verificación es `npm run build`.

## Invariantes

- **`npm run build` es la verdad.** Encadena dos validadores que comparan los skills
  con el código y fallan si mienten. Si te contradicen, el equivocado es el skill:
  corrígelo en el mismo commit.
- **Ningún `any`, ningún `console.log`, ningún hexadecimal fuera de la paleta.**
  El build rechaza las utilidades de color, sombra y radio que se salgan del sistema.
- **`OnPush` en todo componente**, sin excepción. Es seguro solo porque todo el
  estado es `signal()` / `computed()` / `input()`.
- **Una página nunca inyecta `HttpClient` ni construye una URL.** Eso vive en el
  servicio del dominio.
- **Las cuatro ramas —carga, error, vacío, contenido— son obligatorias** en toda
  vista con datos remotos, y el build lo comprueba. Sin la de error, un backend
  caído dice "no hay clientes", que es una mentira, no un hueco.
- **El backend es la autoridad de permisos.** Ocultar algo aquí no lo protege.

## Rendimiento: el cuello de botella es la RED

Medido contra producción desde Bolivia: la consulta tarda 6-27 ms y el viaje de ida
y vuelta ~190 ms. **El 97% del tiempo de una navegación es red.**

Por eso lo que se nota es *no hacer la petición* — cachear referencia, derivar en
memoria, no bloquear el arranque — y casi nunca micro-optimizar CSS o SQL.

Carga el skill **`crm-rendimiento`** antes de cualquier trabajo de optimización.
Regla corta: **un cambio de rendimiento sin medición antes y después no se commitea.**

## Trampas conocidas

- **`db-enums.ts` es generado**, no se edita a mano. Sale del `schema.prisma` del
  repo hermano. Si el backend añade un valor a un enum, aquí hay que correr
  `npm run sync:tipos` o el build falla.
- **Moneda del sistema: Bs (es-BO)**, siempre vía el pipe `moneda`. Nunca a mano.
  (Las comisiones se calculan en dólares dentro del backend; aquí llegan ya en Bs.)
- **Al partir una plantilla en subcomponentes, el CSS no viaja solo.** La
  encapsulación `Emulated` deja la vista sin estilos y **ningún validador lo
  detecta**. Es el único fallo del proyecto que hay que revisar a ojo.
