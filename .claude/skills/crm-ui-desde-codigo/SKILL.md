---
name: crm-ui-desde-codigo
description: Cómo revisar y dar por buena una pantalla de este CRM SIN navegador, leyendo el código como un senior de frontend que la "ve" — anchos reales del layout, cajones y átomos, cuánto ocupa un texto, qué se trunca o desborda a 390 px y a escritorio, foco, teclado y estados. Úsalo SIEMPRE antes de dar por terminada una vista o un componente nuevo o modificado (HTML, clases de Tailwind o CSS), al revisar el diff de una pantalla, y cuando alguien pregunte cómo se verá algo. El propietario no quiere validación en navegador: esta es la forma de validar.
---

# La interfaz, desde el código

El propietario lo dijo claro: **no se valida en navegador** (ver `CLAUDE.md`). Un senior de
frontend no necesita abrir la pantalla para saber que un badge le come el ancho al texto de al
lado: lo **calcula**. Este skill es ese cálculo, con las medidas reales de este CRM y los errores
que ya aparecieron cuando sí se miró en un navegador real (2026-10-05). Cada regla de abajo es una
cicatriz de esa sesión o de las anteriores.

`npm run build` sigue siendo la compuerta (tipos, `check:skills`, las cuatro ramas). Este skill
cubre lo que el build **no puede** ver: cómo queda.

## 1. El render mental, en orden

Para cada vista nueva o tocada, recorre esto y **escribe en tu respuesta lo que razonaste**
(dos o tres líneas por punto que importe; no un "se ve bien").

1. **El ancho disponible**, de afuera hacia adentro, a **390 px** y a **1440 px** (tabla §2).
   Resta paddings y gaps de cada contenedor hasta llegar al elemento.
2. **Cada fila flex**: lista sus hijos, marca cuáles son `shrink-0` o de ancho fijo y cuáles
   flexibles, estima el ancho de los fijos (texto §3) y lo que le queda al flexible. Si al
   flexible le quedan menos de ~80 px, lo que muestra es ruido (ver §5.1).
3. **Truncado**: un `truncate` solo funciona si su caja puede encogerse: el hijo flex lleva
   `min-w-0` (o `flex-1 min-w-0`). Sin `min-w-0`, el texto empuja y la fila desborda.
4. **Rejillas**: `grid-cols-2 lg:grid-cols-4` a 390 px son dos columnas de ~170 px. ¿Cabe lo que
   va dentro? Un `<app-input>` con label largo en 170 px parte el label en dos líneas.
5. **Vertical**: dentro de un cajón, el cuerpo es `flex-1 overflow-y-auto` y el pie `shrink-0`.
   ¿Lo más importante queda arriba del primer pliegue (~600 px útiles en un teléfono)?
6. **Los cuatro estados** pintados de verdad: carga (¿el esqueleto mide lo mismo que el
   contenido? si no, salta), error (¿antes de leer `.value()`?), vacío (¿distingue «no hay» de
   «no hay con este filtro»? ¿ofrece la acción solo a quien puede?), contenido.
7. **Datos en los extremos**: nombre de 45 caracteres, 0 y 1 (plural: «1 anuncio» / «2
   anuncios»), `null` (¿«—» o un hueco?), montos grandes con `moneda`, fechas en La Paz.
8. **Interacción**: disabled y loading de cada botón, foco visible, orden de tabulación, qué
   pasa con un 409, sin red, o si el usuario cambia de fila mientras viaja una petición.
9. **Accesibilidad**: nombre accesible de todo control sin texto, `aria-live` en lo que se
   anuncia, objetivos táctiles ≥ 24 px (§4), contraste de lo que es texto (§4).

## 2. Medidas reales del CRM

| Pieza | Medida | Dónde vive |
|---|---|---|
| Padding del área de trabajo | 16 px por lado en móvil; 24 px desde 640 px | `src/app/shared/components/layout/layout.component.css` (`--workspace-pad-x`) |
| Menú lateral | 72 px plegado · 240 px desplegado; oculto en móvil | mismo archivo (`.sidebar`) |
| **Ancho útil a 390 px** | **358 px** (390 − 2×16) | — |
| Ancho útil a 1440 px | ~1150 px con el menú desplegado (1440 − 240 − 2×24) | — |
| Columna del inbox | 320 px fijos (+ panel de 340 px desde 1280 px) | `src/app/features/conversaciones/conversaciones.page.css` |
| Cajón (`<app-drawer>`) | pantalla completa en móvil · `sm` 500/540 · `md` 520/580 · `lg` 560/640 · `xl` 600/720 (desde 640 / desde 1024 px) | `src/app/shared/components/drawer/drawer.component.ts` |
| Cuerpo del cajón | normalmente `p-5`: 20 px por lado → un `xl` a escritorio deja **680 px** útiles; en móvil, **350 px** | — |
| `<app-button>` | `md` ~40 px de alto (`py-2.5` + `text-sm`) · `sm` ~32 px · `xs` ~24 px; con `[circle]`: 44 / 36 / 28 px | `src/app/shared/components/button/button.component.ts` |
| `<app-input>` | ~46 px de alto (`py-3` + `text-sm` + borde) + label de ~20 px encima | `src/app/shared/components/input/input.component.ts` |
| Breakpoints | `sm` 640 · `md` 768 · `lg` 1024 · `xl` 1280 (Tailwind) | — |

Si una medida cambia en el código, cambia esta tabla en el mismo commit.

## 3. Cuánto ocupa un texto (Poppins)

Para estimar sin navegador, por carácter de texto en castellano (mezcla de minúsculas):

| Clase | px por carácter | Ejemplo |
|---|---|---|
| `text-[11px]` | ~6,0 | «Pidió persona · 14 min» (22 c) ≈ 135 px |
| `text-xs` (12 px) | ~6,6 | «Solicitud de cita · 3 min» (25 c) ≈ 165 px |
| `text-sm` (14 px) | ~7,7 | un nombre de 30 c ≈ 230 px |
| `font-semibold` | +5 % | — |

Súmale el padding de la píldora/badge (~20 px) y el ícono (14 px + gap 4 px). Con eso se decide
si algo cabe **antes** de escribirlo, no después de verlo roto.

## 4. Mínimos que no se negocian

- **Objetivo táctil ≥ 24×24 px** (WCAG 2.2 AA). Un botón solo-ícono de 14 px con `padding: 4px`
  mide 22 px: **no cumple**. Iguala el alto al de sus vecinos (`min-height: 32px`). Pasó con el
  «Contexto» del bloque de atención (30×22 en el móvil).
- **Todo control sin texto tiene nombre**, y desde el 2026-10-10 **lo comprueba el
  build** (`verificarNombreAccesible`): un `<app-button>` con `icon` que no proyecta texto,
  y un `<app-input>`/`<app-select>` sin `label`, exigen `ariaLabel`. **`title` no cuenta**
  —es un tooltip de ratón, no llega en táctil y como nombre accesible es el último recurso
  del algoritmo— y **`placeholder` tampoco**, que desaparece al escribir. El barrido de
  estreno encontró 6 botones solo-ícono (dos sin `title` siquiera: anunciados solo como
  «botón») y 37 campos con nada más que su placeholder. **Veintiuno de esos 37 sí tenían
  etiqueta visible al lado** —`<label class="edit-label">Nombre Completo</label>`— pero sin
  asociar: el lector leía el placeholder y pulsar la etiqueta no enfocaba el campo. Lo de
  Finanzas y Comisiones queda congelado (cerradas por decisión del propietario) y solo baja.
- **Todo control sin texto tiene nombre**: `ariaLabel` en `<app-button>`, `<app-select>` y
  `<app-input>` sin `label`. Un buscador sin label es mudo para un lector de pantalla.
- **Lo que se anuncia va en una región viva**: los avisos (`<app-toast-container>`) son
  `aria-live="polite"`; un estado que cambia en la página, `role="status"`.
- **Un `<input type="file">` va en `sr-only`, nunca `hidden`**: con `display:none` no se alcanza
  con el teclado —y un `<label>` tampoco entra en el orden de tabulación, así que envolverlo no
  salva nada—. El foco se pinta en el envoltorio con **`.crm-foco-dentro`** (o
  `.crm-subir-archivo`, que ya lo trae), porque el input no se ve.
  **Barrido del 2026-10-10**: de diez selectores de archivo, tres lo hacían bien y siete usaban
  `hidden`. **Tres estaban de verdad fuera del alcance del teclado** —adjuntar en el chat, el
  comprobante de una venta y la subida a Mi Memoria— porque su `<label>` era el único
  disparador. Los otros cuatro tenían además un botón que hacía `.click()` sobre el input, así
  que se alcanzaban por ahí; el de la foto de perfil era uno de esos. El de Comisiones queda
  como está.
- **Contraste de texto ≥ 4,5:1**. El verde `info` (#39ADA3) sobre su fondo claro da ~2,4:1: sirve
  como acento o ícono, no para texto que hay que leer. `text-muted` (#6B7280) sobre blanco sí
  cumple.
- **Movimiento reducido**: las animaciones del sistema ya lo respetan; una nueva usa las clases de
  `src/styles.css`, no un `@keyframes` propio.

## 5. Errores que ya pasaron (y cómo se veían en el código)

Todos se vieron en un navegador real el 2026-10-05. Ninguno lo detectaba el build. Todos se
podían ver leyendo el código con §2 y §3:

1. **Una insignia larga le come la fila al texto flexible.** Tarjeta del inbox (320 px − avatar −
   paddings ≈ 227 px de contenido) con `vista previa (flex-1 min-w-0 truncate)` + `badge «Pidió
   persona · 14 min» (shrink-0, ~150 px)` + contador (~20 px): a la vista previa le quedaban
   ~45 px → «Hab…». La cuenta estaba toda en el código.
2. **Moverla a otra fila sin recontar la desplazó al vecino.** Puesta junto al nombre de la línea,
   recortó «Recepción (demo)» de forma irregular según el largo de cada insignia. Solución: su
   propia fila. Antes de mover algo, recalcula la fila de destino.
3. **Un fallo sin red recargaba el hilo y lo reemplazaba por el error.** `detalle.reload()` tras
   una acción fallida, sin red, pone el recurso en error y la plantilla cambia el contenido por
   «No se pudieron cargar…». Regla: tras un error **sin respuesta** (status 0) no se recarga;
   el socket recarga al volver la red.
4. **Una fila que deja de ser visible para alguien no se va sola** si el aviso en vivo no le llega
   (era del backend: la audiencia se calculaba después del cambio). Al razonar tiempo real,
   pregunta: ¿a quién le llega el aviso cuando el cambio lo saca de su vista?
5. **Botón solo-ícono de 22 px** y **toasts sin `aria-live`**: ver §4.

## 6. Cómo se dice que una pantalla está lista

No con «se ve bien». Con lo razonado, por ejemplo:

> A 390 px el cajón deja 350 px: la rejilla de precios pasa a una columna (`grid-cols-1
> sm:grid-cols-3`), así que el label «Precio promocional (Bs)» cabe en una línea. En la tabla, la
> columna «Promoción» lleva miniatura de 44 px + título con `min-w-0`; un título de 45 caracteres
> se trunca, no empuja. Los botones solo-ícono son `xs [circle]` (28 px) con `ariaLabel`.

Si algo no se puede afirmar desde el código —una imagen de tamaño desconocido, un texto que
viene del usuario—, dilo y deja la caja preparada (proporción fija, `object-fit`, `truncate`).

## Mantenimiento

`check:skills` comprueba que las rutas citadas existan. Las medidas de §2 y §3 las mantiene
quien cambie el layout, un átomo o la tipografía, en el mismo commit.
