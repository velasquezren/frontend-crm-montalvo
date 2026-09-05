#!/usr/bin/env node
/**
 * Verifica que lo que afirman los skills de .claude/skills/ siga siendo cierto.
 *
 *   node tools/verificar-skills.mjs      → informa y falla (exit 1) si hay drift
 *
 * Por qué existe: un skill es una fuente de autoridad para quien programa aquí
 * (humano o agente). Cuando envejece no se rompe ruidosamente como el código —
 * simplemente empieza a mentir, y quien lo lee escribe algo mal con total
 * confianza. Ya pasó: la paleta documentaba un rojo `#EF4444` que no existía y
 * un `<app-page-header description>` que en realidad se llamaba `subtitle`.
 *
 * La prosa (reglas, decisiones, el porqué de cada patrón) envejece bien y no se
 * puede verificar automáticamente. Lo que se pudre son los DATOS: hexadecimales,
 * nombres de inputs, rutas de archivo. Eso es justo lo que revisa este script.
 *
 * El backend vive en un repositorio hermano. Si no está presente (por ejemplo en
 * el build de Vercel, que solo clona el frontend) sus rutas se omiten en vez de
 * fallar: esto es una red de seguridad de desarrollo, no un requisito de build.
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join, relative } from 'node:path';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SKILLS = resolve(RAIZ, '.claude', 'skills');
const STYLES = resolve(RAIZ, 'src', 'styles.css');
const ROLES = resolve(RAIZ, 'src', 'app', 'core', 'auth', 'roles.ts');
const HERMANO = resolve(RAIZ, '..', 'backend-crm-montalvo');

const IGNORAR = new Set(['node_modules', '.git', 'dist', '.angular', '.claude', '.agents']);
const EXTENSIONES = /\.(ts|css|html|md|mjs|js|json|prisma)$/;

const problemas = [];
const señala = (skill, mensaje) => problemas.push({ skill, mensaje });

/** Índice de todos los archivos del proyecto (y del backend si está clonado). */
function indexar(raiz, acumulado = []) {
  for (const entrada of readdirSync(raiz)) {
    if (IGNORAR.has(entrada)) continue;
    const ruta = join(raiz, entrada);
    if (statSync(ruta).isDirectory()) indexar(ruta, acumulado);
    else acumulado.push(ruta);
  }
  return acumulado;
}

const ARCHIVOS = [
  ...indexar(resolve(RAIZ, 'src')),
  ...indexar(resolve(RAIZ, 'tools')),
  ...readdirSync(RAIZ)
    .map(e => join(RAIZ, e))
    .filter(r => statSync(r).isFile()),
  ...(existsSync(HERMANO) ? indexar(resolve(HERMANO, 'src')) : []),
  ...(existsSync(HERMANO) ? indexar(resolve(HERMANO, 'prisma')) : []),
];

/** Quita los bloques ``` para no confundir identificadores de código con rutas. */
const sinCodigo = texto => texto.replace(/```[\s\S]*?```/g, '');

/** Todo lo que va entre comillas invertidas. */
const entrecomillado = texto => [...texto.matchAll(/`([^`\n]+)`/g)].map(m => m[1]);

// ── 1. Rutas de archivo citadas en la prosa ───────────────────────────────────
// Los skills citan archivos del backend (`common/auth/roles.ts`). Sin el repo
// hermano clonado —el build de Vercel solo trae el frontend— esas rutas no se
// pueden resolver y marcarlas como rotas sería un falso positivo que tumba el
// despliegue. El resto de comprobaciones son locales y siguen siendo estrictas.
function verificarRutas(skill, texto) {
  if (!existsSync(HERMANO)) return;
  const candidatas = entrecomillado(sinCodigo(texto))
    .filter(t => EXTENSIONES.test(t) && !t.includes(' ') && !t.includes('<'))
    .map(t => t.replace(/^\.\//, ''))
    // Una extensión suelta (`.component.ts`) es prosa, no una ruta.
    .filter(t => !t.startsWith('.'));

  for (const ruta of new Set(candidatas)) {
    // Las rutas se citan parciales (`core/auth/roles.ts`, `moneda.pipe.ts`):
    // basta con que algún archivo real termine con ella.
    const existe = ARCHIVOS.some(a => a.replaceAll('\\', '/').endsWith(`/${ruta}`));
    if (!existe) señala(skill, `ruta inexistente: \`${ruta}\``);
  }
}

// ── 2. Selectores <app-…> ─────────────────────────────────────────────────────
const SELECTORES_REALES = new Set(
  ARCHIVOS.filter(a => a.endsWith('.component.ts')).flatMap(a =>
    [...readFileSync(a, 'utf8').matchAll(/selector:\s*'([^']+)'/g)].map(m => m[1]),
  ),
);

function verificarSelectores(skill, texto) {
  const citados = new Set([...texto.matchAll(/<(app-[a-z-]+)/g)].map(m => m[1]));
  for (const selector of citados) {
    if (!SELECTORES_REALES.has(selector)) señala(skill, `componente inexistente: <${selector}>`);
  }
}

// ── 3. Inputs y outputs de la tabla de inventario ─────────────────────────────
/**
 * Mapa selector → API pública declarada en el componente.
 *
 * Un slot de proyección (`<ng-content select="[cabecera]">`) es API igual que un
 * `input()`: la vista de fuera tiene que saber que existe y cómo se llama, y si
 * se renombra, las plantillas que lo usan dejan de proyectar **en silencio** —
 * el contenido se cae al slot por defecto y aparece en otro sitio, sin error de
 * compilación. Por eso cuenta para las dos direcciones del chequeo.
 */
function apiDelComponente(selector) {
  const archivo = ARCHIVOS.filter(a => a.endsWith('.component.ts')).find(a =>
    readFileSync(a, 'utf8').includes(`selector: '${selector}'`),
  );
  if (!archivo) return null;
  const fuente = readFileSync(archivo, 'utf8');
  return new Set([
    ...[...fuente.matchAll(/readonly\s+(\w+)\s*=\s*(?:input|output|model)\b/g)].map(m => m[1]),
    ...[...fuente.matchAll(/<ng-content\s+select="\[([\w-]+)\]"/g)].map(m => m[1]),
  ]);
}

/**
 * Las filas del inventario, y **solo** esas.
 *
 * Antes bastaba con que una fila de tabla nombrara un `<app-algo>` para que se
 * leyera como inventario, y el skill tiene otras dos tablas que citan
 * componentes: la de animaciones ("la pone `<app-drawer>`, no la escribas a
 * mano") y la que dice con qué se escribe cada cápsula, cuya segunda columna es
 * exactamente `<app-badge>`. Ambas entraban al chequeo sin columna de API y el
 * validador concluía que el átomo no documentaba ninguno de sus miembros.
 *
 * Lo que las distingue es la FORMA: el inventario tiene tres columnas
 * (`| Nombre | <selector> | API |`) y las otras dos. Exigirlo quita los dos
 * falsos positivos sin perder nada — y deja escribir tablas de referencia que
 * citen componentes, que es lo que uno quiere poder hacer en un skill.
 */
function filasDeInventario(texto) {
  const filas = [];
  for (const fila of texto.split('\n')) {
    if (!fila.startsWith('|')) continue;
    const columnas = fila.split('|');
    /* '' + tres columnas + '' — una tabla de dos columnas da 4 y no es esta. */
    if (columnas.length < 5) continue;
    const selector = columnas[2]?.trim().replace(/^`|`$/g, '').match(/^<(app-[a-z-]+)>$/)?.[1];
    if (selector) filas.push({ selector, columnaApi: columnas.slice(3).join('|') });
  }
  return filas;
}

/**
 * Que no exista un átomo SIN FILA.
 *
 * `verificarInventario` recorre las filas de la tabla, así que un componente que
 * no aparece en ninguna es invisible para las dos direcciones del chequeo: ni se
 * comprueba su API ni se avisa de que falta. Es el caso peor, porque el
 * inventario es justo lo que se lee para decidir si hace falta un componente
 * nuevo o basta una variante — y lo que no está listado se reinventa.
 *
 * Pasó con `<app-timeline>` el 2026-08-20: se extrajo como átomo (bien) y entró
 * sin fila, junto a otros tres que llevaban más tiempo sin documentar.
 */
function verificarInventarioCompleto(skill, texto) {
  /* Citarlo de pasada en la prosa no es documentarlo: lo que se lee para decidir
     si un átomo ya existe es la tabla, así que solo cuenta tener fila propia. */
  const documentados = new Set(filasDeInventario(texto).map(f => f.selector));

  for (const archivo of ARCHIVOS) {
    if (!archivo.includes('/shared/components/')) continue;
    const selector = readFileSync(archivo, 'utf8').match(/selector: '(app-[a-z-]+)'/)?.[1];
    if (!selector || documentados.has(selector)) continue;

    señala(
      skill,
      `<${selector}> vive en shared/components/ y no está en el inventario — ` +
        'añade su fila, o la próxima sesión lo reinventará por no saber que existe.',
    );
  }
}

function verificarInventario(skill, texto) {
  for (const { selector, columnaApi } of filasDeInventario(texto)) {
    const api = apiDelComponente(selector);
    if (!api) continue; // el chequeo de selectores ya lo reportó

    const miembros = entrecomillado(columnaApi)
      .map(t => t.replace(/^\[?\(?|\)?\]?$/g, '')) // (clicked) y [(value)] → clicked, value
      .filter(t => /^[a-zA-Z]\w*$/.test(t));

    for (const miembro of new Set(miembros)) {
      if (!api.has(miembro)) señala(skill, `<${selector}> no tiene \`${miembro}\``);
    }

    /* La dirección contraria: que el ÁTOMO no crezca sin decirlo.
       Lo de arriba solo comprueba que el skill no invente miembros; un `input()`
       nuevo se colaba sin aparecer en el inventario, y el inventario es
       precisamente lo que se lee para saber si hace falta un componente nuevo o
       basta una variante. Cuando la tabla envejece, la sesión siguiente no ve la
       variante y duplica el átomo — que es como `.kpi-card` acabó definida a
       mano en cuatro CSS distintos. Pasó con `compacto` el 2026-08-14. */
    const declarados = new Set(miembros);
    for (const miembro of api) {
      if (!declarados.has(miembro)) {
        señala(
          skill,
          `<${selector}> expone \`${miembro}\` y el inventario no lo menciona — ` +
            'añádelo a su fila para que se sepa que existe.',
        );
      }
    }
  }
}

// ── 4. Paleta de color contra los tokens reales de styles.css ─────────────────
function verificarPaleta(skill, texto) {
  const css = readFileSync(STYLES, 'utf8');
  for (const fila of texto.split('\n')) {
    const m = fila.match(/^\|\s*`([a-z-]+)`\s*\|\s*`(#[0-9A-Fa-f]{6})`\s*\|/);
    if (!m) continue;
    const [, token, hex] = m;
    const real = css.match(new RegExp(`--color-${token}:\\s*(#[0-9A-Fa-f]{6})`))?.[1];
    if (!real) señala(skill, `token inexistente en styles.css: \`${token}\``);
    else if (real.toLowerCase() !== hex.toLowerCase())
      señala(skill, `\`${token}\` documentado ${hex}, real ${real}`);
  }
}

// ── 5. Clases de animación ────────────────────────────────────────────────────
function verificarAnimaciones(skill, texto) {
  const css = readFileSync(STYLES, 'utf8');
  for (const clase of new Set(entrecomillado(texto).filter(t => /^animate-[a-z-]+$/.test(t)))) {
    if (!css.includes(`.${clase}`)) señala(skill, `clase de animación inexistente: \`${clase}\``);
  }
}

// ── 6. Roles ──────────────────────────────────────────────────────────────────
function verificarRoles(skill, texto) {
  const reales = new Set(
    [...readFileSync(ROLES, 'utf8').matchAll(/^\s*(\w+):\s*\d+,/gm)].map(m => m[1]),
  );
  for (const rol of new Set([...texto.matchAll(/\b(AGENTE|ADMIN|SUPER_ADMIN)\b/g)].map(m => m[1]))) {
    if (!reales.has(rol)) señala(skill, `rol inexistente en core/auth/roles.ts: ${rol}`);
  }
  for (const rol of reales) {
    if (!texto.includes(rol) && skill === 'crm-feature-page')
      señala(skill, `rol ${rol} existe en el código pero el skill no lo menciona`);
  }
}

// ── 7. El CÓDIGO obedece al sistema de diseño ─────────────────────────────────
// Las seis comprobaciones anteriores validan una sola dirección: que el skill no
// mienta sobre el código. Esta valida la contraria —que el código no rompa lo que
// el skill declara ley— y es la que faltaba: el inbox había acumulado 17
// desviaciones (una escala ámbar completa donde la paleta excluye ámbares a
// propósito, cinco sombras ajenas, ocho radios distintos) sin que nada avisara.
//
// DEUDA: las vistas que ya venían sucias no tumban el build, pero su número está
// congelado y **solo puede bajar**. Si un archivo mejora, el check falla pidiendo
// que actualices la cifra; si empeora o aparece uno nuevo, falla también. Así la
// regla es ley desde hoy sin obligar a un refactor de golpe, y la deuda no puede
// quedarse quieta fingiendo que no existe.

const COLOR_AJENO =
  /\b(?:bg|text|border|from|to|via|ring|divide|outline|decoration|shadow|accent|caret|fill|stroke)-(?:amber|yellow|red|orange|rose|slate|gray|zinc|neutral|stone|green|blue|indigo|purple|pink|emerald|teal|sky|lime|cyan|violet|fuchsia)-\d{2,3}\b/g;


/** Hexadecimales sueltos en CSS: la paleta es cerrada y todo tono se deriva con
    `color-mix()` sobre un token, nunca con un hex nuevo. Los nueve de la paleta
    se admiten como fallback de `var(--token, #hex)`. */
const HEX_AJENO =
  /#(?!006156|39ADA3|FFFFFF|EAF7F5|1F2937|6B7280|000000|F8F9FA|E5E7EB)[0-9a-f]{6}\b/gi;

const SOMBRA_AJENA = /\bshadow-(?:2xs|xs|sm|md|lg|xl|2xl|inner)\b/g;

/** El sistema define tres radios: inputs 12px, tarjetas 16px, píldoras redondas. */
const RADIO_AJENO = /border-radius:\s*(?!12px|16px|9999px|50%|0)[0-9]+(?:px|rem)/g;

/**
 * Violaciones toleradas por archivo. **Vacío desde el 2026-08-05: la deuda se
 * pagó entera.** Se deja el mecanismo porque su gracia es no volver a
 * necesitarlo: si algún día hay que congelar algo, se anota aquí y a partir de
 * ese número **solo puede bajar** —arreglar obliga a actualizar la cifra,
 * empeorar rompe el build—. Lo que no se puede es añadir una entrada y
 * olvidarla: una que ya no corresponda a ningún archivo también falla.
 */
const DEUDA = {
  /* Aparecida el 2026-08-11 al extender la regla `hex` a los .ts: no es deuda
     nueva, es deuda que llevaba tiempo siendo invisible. Y no es descuido —
     ORIGEN_COLOR asigna un color de MARCA a cada canal (teal de WhatsApp, azul
     de Facebook, violeta de Instagram) para distinguir nueve orígenes en el
     gráfico de leads. La paleta cerrada ofrece tres tonos usables; con tres, ese
     gráfico deja de leerse.

     Se congela en vez de arreglarse porque resolverlo es una decisión de
     identidad visual, no una limpieza: o se aceptan los colores de canal como
     excepción documentada, o se derivan nueve tonos de la marca y el gráfico
     pasa a distinguirse por otra cosa (patrón, etiqueta directa). Esa decisión
     es del dueño del producto. Mientras tanto la cifra solo puede bajar. */
  'features/dashboard/dashboard.page.ts': { hex: 11 },
};

const REGLAS = [
  { clave: 'color', patron: COLOR_AJENO, ext: /\.html$/, que: 'color(es) fuera de la paleta cerrada' },
  { clave: 'sombra', patron: SOMBRA_AJENA, ext: /\.html$/, que: 'sombra(s) fuera de shadow-subtle/lifted' },
  { clave: 'radio', patron: RADIO_AJENO, ext: /\.css$/, que: 'radio(s) fuera de 12px/16px/píldora' },
  { clave: 'hex', patron: HEX_AJENO, ext: /\.css$/, que: 'hexadecimal(es) fuera de la paleta cerrada' },
  /* Los componentes llevan su CSS en un `styles:` dentro del .ts, y hay datos de
     configuración que también eligen color (los `accent` del FAB). Mirar solo
     .css dejaba esa puerta abierta: el menú flotante acumuló un índigo, un
     esmeralda y un ámbar —#6366f1, #10b981, #f59e0b— en layout.component.ts sin
     que nada avisara, justo los tonos que la paleta excluye a propósito. */
  { clave: 'hex', patron: HEX_AJENO, ext: /\.ts$/, que: 'hexadecimal(es) fuera de la paleta cerrada' },
  /* Mismo hueco que el de arriba, pero con clases de utilidad en vez de hex:
     un `computed()` que arma `'bg-amber-100 text-amber-800 …'` como string y lo
     mete por `[class]` renderiza el color igual que si estuviera escrito en el
     .html, pero el regex de `color`/`sombra` solo miraba .html y no lo veía.
     Así vivieron sin que nada avisara un medallero ámbar/gris en
     dashboard.page.ts y cuatro variantes de toast en semáforo completo
     (esmeralda/rosa/ámbar/celeste) en toast-container.component.ts — el
     componente que más se ve en toda la app. */
  { clave: 'color', patron: COLOR_AJENO, ext: /\.ts$/, que: 'color(es) fuera de la paleta cerrada' },
  { clave: 'sombra', patron: SOMBRA_AJENA, ext: /\.ts$/, que: 'sombra(s) fuera de shadow-subtle/lifted' },
];

function verificarCodigo() {
  const base = resolve(RAIZ, 'src', 'app');
  const señalaCodigo = mensaje => problemas.push({ skill: 'crm-design-system', mensaje });

  for (const ruta of indexar(base)) {
    const rel = relative(base, ruta);
    for (const { clave, patron, ext, que } of REGLAS) {
      if (!ext.test(ruta)) continue;
      const hallados = (readFileSync(ruta, 'utf8').match(patron) ?? []).length;
      const tolerado = DEUDA[rel]?.[clave] ?? 0;

      if (hallados > tolerado) {
        señalaCodigo(
          `${rel}: ${hallados} ${que}` +
            (tolerado ? ` (la deuda congelada era ${tolerado}; no debe subir)` : ''),
        );
      } else if (hallados < tolerado) {
        señalaCodigo(
          `${rel}: mejoró a ${hallados} ${que} — baja la deuda a ${hallados}` +
            (hallados === 0 ? ' (o borra la entrada) ' : ' ') +
            'en DEUDA de tools/verificar-skills.mjs.',
        );
      }
    }
  }

  /* ── Toda vista con datos remotos declara su estado de error ──────────────
     No es una regla de estilo: sin esa rama, un backend caído cae en el estado
     vacío y la pantalla afirma "no hay clientes" o "no hay comisiones". El
     agente lo lee como un dato —"hoy no hay nada"— y cierra. Faltaba en seis de
     las doce vistas y nadie lo había notado, porque en desarrollo el servidor
     siempre responde. */
  for (const ruta of indexar(base).filter(r => r.endsWith('.page.ts'))) {
    const codigo = readFileSync(ruta, 'utf8');
    if (!codigo.includes('httpResource')) continue;

    const plantilla = ruta.replace(/\.ts$/, '.html');
    if (!existsSync(plantilla)) continue;

    const html = readFileSync(plantilla, 'utf8');
    if (!/\.error\(\)|app-error-carga/.test(html)) {
      señalaCodigo(
        `${relative(base, plantilla)}: la vista pide datos con httpResource pero no ` +
          'declara estado de error. Sin él, un servidor caído se muestra como "no hay datos". ' +
          'Usa <app-error-carga>.',
      );
    }
  }

  /* Una entrada que ya no corresponde a ningún archivo es deuda fantasma:
     alguien borró o renombró la vista y la cifra se quedó mintiendo. */
  for (const rel of Object.keys(DEUDA)) {
    if (!existsSync(resolve(base, rel))) {
      señalaCodigo(`DEUDA menciona ${rel}, que ya no existe — bórrala.`);
    }
  }
}

// ── 8. Ninguna píldora suelta: o es un átomo, o es una utilidad con nombre ───
// Una cápsula diminuta —`rounded-full` + `text-[10px]`— es la forma que toma en
// este proyecto un dato que alguien quiso destacar. Se escriben de a una y no
// rompen nada, así que se acumulan: llegaron a ser DIECIOCHO repartidas por
// nueve vistas, y en la ficha del paciente había cinco juntas de colores
// distintos. El usuario lo dijo mejor que ningún linter: "tanta información,
// tantos botones".
//
// El problema de fondo es que la misma forma decía tres cosas incompatibles: un
// estado (que es <app-badge>), un contador de pestaña, y un dato de apoyo (que
// no debería ser cápsula en absoluto). Nombrarlas obliga a elegir cuál es:
//
//   estado                  → <app-badge>
//   contador de pestaña     → .crm-contador (+ -activo / -inverso)
//   dato de apoyo           → .crm-meta / .crm-meta-clave
//   atajo que se teclea     → .crm-atajo
//   medalla sobre un avatar → .crm-medalla
//
// Los átomos (button, badge, filter-chip) arman sus clases en el .ts y por eso
// no caen acá; `shared/components/` queda exento para el día que uno necesite
// una plantilla aparte.
function verificarPildoras() {
  const base = resolve(RAIZ, 'src', 'app');
  const ATRIBUTO = /class="([^"]*)"/g;
  const MINUSCULA = /\btext-\[(?:[0-9]|1[01])px\]/;

  for (const ruta of indexar(base)) {
    if (!/\.(html|ts)$/.test(ruta)) continue;
    const rel = relative(base, ruta);
    if (rel.startsWith('shared/components/')) continue;

    const codigo = readFileSync(ruta, 'utf8');
    const sueltas = [...codigo.matchAll(ATRIBUTO)]
      .map(m => m[1])
      .filter(clases => /\brounded-full\b/.test(clases) && MINUSCULA.test(clases));

    if (sueltas.length === 0) continue;

    problemas.push({
      skill: 'crm-design-system',
      mensaje:
        `${rel}: ${sueltas.length} píldora(s) armada(s) a mano con utilidades ` +
        '(`rounded-full` + `text-[≤11px]`). Decide qué es y usa su nombre: ' +
        '<app-badge> si es un estado, `.crm-contador` si es un contador de pestaña, ' +
        '`.crm-meta` si es un dato de apoyo, `.crm-atajo` si es algo que se teclea.',
    });
  }
}

// ── 8. El nombre de un cliente se pinta con su pipe, nunca en crudo ──────────
// Un contacto que escribe por WhatsApp sin dar su nombre se guarda como
// "WhatsApp +59171836560". Interpolarlo tal cual deja la ficha diciendo el mismo
// teléfono dos veces —una como título, otra como dato— y la palabra "WhatsApp"
// haciendo de nombre de pila; y `generarIniciales` sobre eso da "W+", que no son
// las iniciales de nadie.
//
// No es un fallo que se rompa: se ve mal en la vista que se olvidó, y se olvida
// una a la vez. Estaba en quince sitios repartidos por seis vistas. Por eso la
// regla no pide "acordate del pipe": prohíbe la forma cruda.
function verificarNombreCliente() {
  const base = resolve(RAIZ, 'src', 'app');
  /* `algo.cliente.nombre` o `cliente.nombre` interpolado, y el mismo camino
     pasado a `iniciales(...)`. Un `{{ ag.nombre }}` (agente) o un
     `cliente.agente.nombre` no casan: solo el nombre DEL cliente. */
  const CRUDO = /\{\{\s*(?:[\w$]+\.)*cliente\.nombre\s*(?:\|\s*\w+\s*)?\}\}|iniciales\(\s*(?:[\w$]+\.)*cliente\.nombre\s*\)/g;

  for (const ruta of indexar(base).filter(r => r.endsWith('.html'))) {
    const hallados = (readFileSync(ruta, 'utf8').match(CRUDO) ?? []).filter(
      t => !/\|\s*(nombreCliente|inicialesCliente)/.test(t),
    );
    if (hallados.length === 0) continue;

    problemas.push({
      skill: 'crm-design-system',
      mensaje:
        `${relative(base, ruta)}: pinta el nombre del cliente en crudo ` +
        `(${hallados.length} vez/veces). Usa \`{{ x.cliente | nombreCliente }}\` y ` +
        '`[initials]="x.cliente | inicialesCliente"`, o un contacto sin nombre sale ' +
        'como "WhatsApp +591…" y su avatar como "W+".',
    });
  }
}

// ── 8. El cajón lateral se usa, no se reescribe ──────────────────────────────
// La conversión de modales a cajones (2026-09-05) dejó diez `<aside … 
// animate-drawer-in>` en seis plantillas con cinco anchos distintos, seis copias
// de la misma cabecera y nueve del mismo `panelClass`. Nada falló: compilaba,
// los tipos pasaban y se veía bien. Lo que se rompió fue lo invisible — ningún
// cajón atrapaba el foco pese a declarar `aria-modal="true"`, y solo dos de las
// once páginas cerraban con Escape.
//
// Es el fallo típico de este proyecto: no explota, se dispersa. Por eso la regla
// no pide "reutiliza el átomo" en un documento, sino que hace imposible lo otro:
// la animación del cajón y el panel del overlay tienen UN dueño cada uno, y
// cualquier otro archivo que los escriba tumba el build.
function verificarCajonUnico() {
  const base = resolve(RAIZ, 'src', 'app');
  const señala_ = mensaje => problemas.push({ skill: 'crm-design-system', mensaje });

  /** clave → { patron, dueño, arreglo } */
  const EXCLUSIVOS = {
    'animate-drawer-in': {
      patron: /animate-drawer-in/,
      dueño: 'shared/components/drawer/',
      arreglo:
        'usa <app-drawer> (ancho sm/md/lg/xl/ancho) en vez de escribir el <aside> del cajón a mano',
    },
    'panel del overlay del cajón': {
      patron: /'justify-end'/,
      dueño: 'shared/components/dialog/',
      arreglo: 'ábrelo con DialogService.abrirCajon(), que ya trae ese panelClass',
    },
  };

  for (const ruta of indexar(base)) {
    const rel = relative(base, ruta);
    if (!/\.(ts|html|css)$/.test(ruta)) continue;
    const codigo = readFileSync(ruta, 'utf8');

    for (const [que, { patron, dueño, arreglo }] of Object.entries(EXCLUSIVOS)) {
      if (rel.startsWith(dueño) || !patron.test(codigo)) continue;
      señala_(`${rel}: escribe \`${que}\` a mano, y eso solo vive en ${dueño} — ${arreglo}.`);
    }
  }
}

// ── 8. El CSS viaja con su HTML al partir una plantilla ──────────────────────
// Con encapsulación `Emulated`, mover un bloque de HTML a un subcomponente y
// dejar su CSS en el padre no rompe nada que se pueda compilar: `ng build` pasa,
// los tipos pasan, y la vista sale sin estilos. Era el único fallo del proyecto
// que había que revisar a ojo, y a ojo es justo lo que no escala cuando se parte
// una plantilla de 1.400 líneas en cuatro.
//
// La regla no intenta adivinar qué es una utilidad de Tailwind y qué es una
// clase nuestra: lo deduce del propio repo. Si algún .css define `.chat-header`,
// esa clase es del proyecto y tiene dueño; si aparece en el HTML de OTRO
// componente, el estilo no la va a alcanzar. Las que no define nadie son
// utilidades y se ignoran solas.
function verificarCssEncapsulado() {
  const base = resolve(RAIZ, 'src', 'app');
  const sinKeyframes = css => css.replace(/@keyframes[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '');
  const clasesDe = css =>
    [...sinKeyframes(css).matchAll(/\.(-?[a-zA-Z_][\w-]*)/g)].map(coincidencia => coincidencia[1]);
  /* Un componente son sus tres archivos hermanos (.ts/.html/.css) bajo el mismo
     nombre; el .css puede además venir inline en `styles:` dentro del .ts. */
  const clave = ruta => ruta.replace(/\.(css|html|ts)$/, '');

  const globales = new Set(
    existsSync(resolve(RAIZ, 'src/styles.css'))
      ? clasesDe(readFileSync(resolve(RAIZ, 'src/styles.css'), 'utf8'))
      : [],
  );

  const dueños = new Map();
  const propiasDe = new Map();
  for (const ruta of indexar(base)) {
    let css = '';
    if (ruta.endsWith('.css')) css = readFileSync(ruta, 'utf8');
    else if (ruta.endsWith('.ts'))
      css = readFileSync(ruta, 'utf8').match(/styles:\s*\[([\s\S]*?)\]\s*[,}]/)?.[1] ?? '';
    if (!css) continue;

    const propias = propiasDe.get(clave(ruta)) ?? new Set();
    for (const clase of clasesDe(css)) {
      propias.add(clase);
      if (!dueños.has(clase)) dueños.set(clase, new Set());
      dueños.get(clase).add(clave(ruta));
    }
    propiasDe.set(clave(ruta), propias);
  }

  for (const ruta of indexar(base).filter(r => r.endsWith('.html'))) {
    const propias = propiasDe.get(clave(ruta)) ?? new Set();
    const usadas = new Set();
    for (const atributo of readFileSync(ruta, 'utf8').matchAll(/class="([^"]*)"/g))
      for (const clase of atributo[1].split(/\s+/))
        if (/^-?[a-zA-Z_][\w-]*$/.test(clase)) usadas.add(clase);

    for (const clase of usadas) {
      if (propias.has(clase) || globales.has(clase) || !dueños.has(clase)) continue;
      const donde = [...dueños.get(clase)].map(d => `${relative(base, d)}.css`).join(', ');
      problemas.push({
        skill: 'crm-design-system',
        mensaje:
          `${relative(base, ruta)}: usa .${clase} pero su CSS vive en ${donde}. ` +
          'Con encapsulación Emulated no lo alcanza: mueve esas reglas al CSS de ' +
          'este componente (o a src/styles.css si de verdad es compartida).',
      });
    }
  }
}

// ── 9. Rendimiento: las tres decisiones medidas siguen en pie ─────────────────
// El skill crm-rendimiento existe porque tres commits `perf` seguidos dejaron el
// archivo con el mismo hash con el que empezó: sin medición no hay dirección. Lo
// que se puede automatizar no es "¿mediste?" —eso es criterio— sino que las tres
// decisiones que SÍ están medidas no se deshagan por descuido.
function verificarRendimiento() {
  const skill = 'crm-rendimiento';
  const archivo = join(SKILLS, skill, 'SKILL.md');
  if (!existsSync(archivo)) return;
  const texto = readFileSync(archivo, 'utf8');

  /* a) La lista de endpoints cacheados del skill contra la del código. Es la
     comprobación que más importa: ampliar la caché a un endpoint de la operación
     del día (clientes, ventas, conversaciones) no rompe nada visible, solo hace
     que la pantalla muestre datos de hace un minuto como si fueran de ahora. Si
     el skill y el código tienen que coincidir, ampliarla obliga a escribir aquí
     por qué, que es justo la pregunta que hay que hacerse. */
  const interceptor = resolve(RAIZ, 'src', 'app', 'core', 'api', 'cache.interceptor.ts');
  if (existsSync(interceptor)) {
    const codigo = readFileSync(interceptor, 'utf8');
    const bloque = codigo.match(/const REFERENCIA\s*=\s*\[([\s\S]*?)\]/);
    const enCodigo = new Set(
      [...(bloque?.[1] ?? '').matchAll(/'([^']+)'/g)].map(m => m[1]),
    );
    /* Una línea que es SOLO una ruta de endpoint. No se intenta localizar el
       bloque ``` que la contiene: emparejar fences es frágil cuando el archivo
       ya tiene otros bloques (el cierre de uno parece la apertura del siguiente),
       y una línea suelta con esta forma no aparece en prosa. */
    const enSkill = new Set(
      texto
        .split('\n')
        .map(l => l.trim())
        .filter(l => /^\/[a-z0-9-]+(\/[a-z0-9-]+)*$/.test(l)),
    );

    for (const ruta of enCodigo) {
      if (!enSkill.has(ruta)) {
        señala(
          skill,
          `cache.interceptor.ts cachea \`${ruta}\` y el skill no lo documenta. ` +
            'Añádelo a la lista y escribe qué se ve si ese dato llega un minuto tarde.',
        );
      }
    }
    for (const ruta of enSkill) {
      if (!enCodigo.has(ruta)) {
        señala(skill, `el skill documenta \`${ruta}\` como cacheado, pero el código ya no lo cachea.`);
      }
    }
  }

  /* b) `provideAppInitializer` bloquea el arranque si se le devuelve la promesa:
     ~575 ms de pantalla en blanco en cada carga y en cada F5. Se dispara con
     `void` a propósito, y es un `return` de una línea lo que lo revierte. */
  const config = resolve(RAIZ, 'src', 'app', 'app.config.ts');
  if (existsSync(config)) {
    const cuerpo = readFileSync(config, 'utf8').match(
      /provideAppInitializer\(\s*\(\)\s*=>\s*\{([\s\S]*?)\}\s*\)/,
    )?.[1];
    if (cuerpo && /\breturn\b/.test(cuerpo)) {
      señala(
        skill,
        'app.config.ts: provideAppInitializer devuelve su promesa y eso bloquea el ' +
          'primer pintado ~575 ms en cada carga. Dispárala con `void` (ver el skill).',
      );
    }
  }

  /* c) Polling ciego. El mecanismo de tiempo real es el WebSocket; el intervalo
     es solo la red de seguridad por si el socket se cae.

     Se resuelven también las constantes del propio archivo. La versión anterior
     solo miraba literales y daba por deliberado «un intervalo extraído a
     constante», pero eso era un agujero, no una excepción: extraer el número a
     una constante —que es lo que pide el buen estilo, y lo que hizo
     `INTERVALO_RESPALDO_MS`— bastaba para volverse invisible al check. Un
     `const CADA = 5000` futuro pasaría en silencio, que es justo lo que esta
     regla existe para impedir. */
  for (const ruta of indexar(resolve(RAIZ, 'src')).filter(r => r.endsWith('.ts'))) {
    const fuente = readFileSync(ruta, 'utf8');

    /* `60_000` y `60000` son el mismo número para JS; el guion bajo se quita
       antes de comparar o `Number('60_000')` daría NaN y no fallaría nunca. */
    const aNumero = texto => Number(String(texto).replace(/_/g, ''));
    const constantes = new Map(
      [...fuente.matchAll(/\bconst\s+([A-Za-z_$][\w$]*)\s*=\s*([\d_]+)\s*;/g)].map(m => [
        m[1],
        aNumero(m[2]),
      ]),
    );

    for (const [, argumento] of fuente.matchAll(
      /setInterval\([\s\S]*?,\s*([\d_]+|[A-Za-z_$][\w$]*)\s*\)/g,
    )) {
      const ms = /^[\d_]+$/.test(argumento) ? aNumero(argumento) : constantes.get(argumento);
      /* Un identificador que no se resuelve aquí (importado de otro archivo) se
         deja pasar: es mejor no señalar que señalar en falso. */
      if (ms === undefined || Number.isNaN(ms) || ms >= 60_000) continue;

      señala(
        skill,
        `${relative(RAIZ, ruta)}: setInterval de ${ms} ms` +
          (/^[\d_]+$/.test(argumento) ? '' : ` (${argumento})`) +
          '. El polling de respaldo es de 60 s; para reaccionar antes usa ' +
          'RealtimeService, no un intervalo más corto.',
      );
    }
  }
}

// ── Ejecución ─────────────────────────────────────────────────────────────────
if (!existsSync(SKILLS)) {
  console.log('· No hay .claude/skills/ — nada que verificar.');
  process.exit(0);
}

if (!existsSync(HERMANO)) {
  console.log('· Repo del backend no encontrado — se omiten las rutas cruzadas.');
}

for (const nombre of readdirSync(SKILLS)) {
  const archivo = join(SKILLS, nombre, 'SKILL.md');
  if (!existsSync(archivo)) continue;
  // angular-developer es un skill de terceros (ver skills-lock.json): no lo auditamos.
  if (nombre === 'angular-developer') continue;

  const texto = readFileSync(archivo, 'utf8');
  verificarRutas(nombre, texto);
  verificarSelectores(nombre, texto);
  verificarInventario(nombre, texto);
  /* Solo contra el skill que ES el inventario: en los demás, no listar un átomo
     no es una omisión — no es su trabajo listarlos. */
  if (texto.includes('## Inventario de átomos')) verificarInventarioCompleto(nombre, texto);
  verificarPaleta(nombre, texto);
  verificarAnimaciones(nombre, texto);
  verificarRoles(nombre, texto);
}

/* Globales, no por skill: miran el código, no la documentación. */
verificarCodigo();
verificarCajonUnico();
verificarNombreCliente();
verificarPildoras();
verificarCssEncapsulado();
verificarRendimiento();

if (problemas.length === 0) {
  console.log('✓ Los skills coinciden con el código.');
  process.exit(0);
}

console.error(`✗ ${problemas.length} desajuste(s) entre los skills y el código:\n`);
for (const { skill, mensaje } of problemas) console.error(`  ${skill}: ${mensaje}`);
console.error('\nCorrige el SKILL.md (o el código) antes de commitear.');
process.exit(1);
