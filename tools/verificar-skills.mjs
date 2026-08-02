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

if (problemas.length === 0) {
  console.log('✓ Los skills coinciden con el código.');
  process.exit(0);
}

console.error(`✗ ${problemas.length} desajuste(s) entre los skills y el código:\n`);
for (const { skill, mensaje } of problemas) console.error(`  ${skill}: ${mensaje}`);
console.error('\nCorrige el SKILL.md (o el código) antes de commitear.');
process.exit(1);
