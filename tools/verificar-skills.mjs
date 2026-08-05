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
/** Mapa selector → API pública declarada en el componente. */
function apiDelComponente(selector) {
  const archivo = ARCHIVOS.filter(a => a.endsWith('.component.ts')).find(a =>
    readFileSync(a, 'utf8').includes(`selector: '${selector}'`),
  );
  if (!archivo) return null;
  const fuente = readFileSync(archivo, 'utf8');
  return new Set(
    [...fuente.matchAll(/readonly\s+(\w+)\s*=\s*(?:input|output|model)\b/g)].map(m => m[1]),
  );
}

function verificarInventario(skill, texto) {
  for (const fila of texto.split('\n')) {
    const selector = fila.match(/<(app-[a-z-]+)>/)?.[1];
    if (!selector || !fila.startsWith('|')) continue;

    const api = apiDelComponente(selector);
    if (!api) continue; // el chequeo de selectores ya lo reportó

    const columnaApi = fila.split('|').slice(3).join('|');
    const miembros = entrecomillado(columnaApi)
      .map(t => t.replace(/^\[?\(?|\)?\]?$/g, '')) // (clicked) y [(value)] → clicked, value
      .filter(t => /^[a-zA-Z]\w*$/.test(t));

    for (const miembro of new Set(miembros)) {
      if (!api.has(miembro)) señala(skill, `<${selector}> no tiene \`${miembro}\``);
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
};

const REGLAS = [
  { clave: 'color', patron: COLOR_AJENO, ext: /\.html$/, que: 'color(es) fuera de la paleta cerrada' },
  { clave: 'sombra', patron: SOMBRA_AJENA, ext: /\.html$/, que: 'sombra(s) fuera de shadow-subtle/lifted' },
  { clave: 'radio', patron: RADIO_AJENO, ext: /\.css$/, que: 'radio(s) fuera de 12px/16px/píldora' },
  { clave: 'hex', patron: HEX_AJENO, ext: /\.css$/, que: 'hexadecimal(es) fuera de la paleta cerrada' },
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

  /* Una entrada que ya no corresponde a ningún archivo es deuda fantasma:
     alguien borró o renombró la vista y la cifra se quedó mintiendo. */
  for (const rel of Object.keys(DEUDA)) {
    if (!existsSync(resolve(base, rel))) {
      señalaCodigo(`DEUDA menciona ${rel}, que ya no existe — bórrala.`);
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
  verificarPaleta(nombre, texto);
  verificarAnimaciones(nombre, texto);
  verificarRoles(nombre, texto);
}

/* Global, no por skill: mira el código, no la documentación. */
verificarCodigo();

if (problemas.length === 0) {
  console.log('✓ Los skills coinciden con el código.');
  process.exit(0);
}

console.error(`✗ ${problemas.length} desajuste(s) entre los skills y el código:\n`);
for (const { skill, mensaje } of problemas) console.error(`  ${skill}: ${mensaje}`);
console.error('\nCorrige el SKILL.md (o el código) antes de commitear.');
process.exit(1);
