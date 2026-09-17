#!/usr/bin/env node
/**
 * Genera src/app/core/build/app-build.ts con el SHA del commit que se compila.
 *
 *   node tools/generar-sello-build.mjs
 *
 * Por qué existe: un despliegue correcto no significa que la clínica esté
 * ejecutando esa versión. La PWA sirve la versión que tenga cacheada hasta que
 * el navegador navegue de nuevo, así que "Vercel ya tiene el fix" y "la agente
 * ya tiene el fix" son dos cosas distintas. El 2026-09-17 esa diferencia costó
 * dos diagnósticos: R2.1 estaba desplegado y el navegador seguía enviando sin
 * `clientMessageId`, y el arreglo del bucle 401 tardó en llegar. Sin un sello,
 * la única forma de saber qué build corre un equipo es deducirlo por el bug que
 * tiene — que es exactamente lo que no queremos.
 *
 * El valor NO se escribe a mano: sale del entorno de CI o de git. En orden:
 *   1. VERCEL_GIT_COMMIT_SHA  (Vercel)
 *   2. GITHUB_SHA             (GitHub Actions)
 *   3. git rev-parse HEAD     (local)
 *
 * El archivo generado está en .gitignore a propósito. Si se commiteara, cada
 * build local lo dejaría sucio y el árbol nunca estaría limpio; por eso los
 * scripts que lo necesitan (`build`, `test`) lo regeneran antes de correr.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CARPETA = resolve(RAIZ, 'src', 'app', 'core', 'build');
const DESTINO = resolve(CARPETA, 'app-build.ts');

/** SHA corto (7) venga de donde venga; `desconocido` si no hay ninguna fuente. */
function resolverSha() {
  const delEntorno = process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GITHUB_SHA;
  if (delEntorno) return delEntorno.slice(0, 7);

  try {
    return execFileSync('git', ['rev-parse', '--short=7', 'HEAD'], {
      cwd: RAIZ,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    /* Sin git y sin CI: el build sigue, solo que sin poder identificarse. */
    return 'desconocido';
  }
}

const sha = resolverSha();
const compiladoEn = new Date().toISOString();

const contenido = `/* GENERADO por tools/generar-sello-build.mjs — no editar a mano.
 * Se reescribe en cada \`npm run build\` y está en .gitignore.
 * Ver el porqué en el encabezado del generador. */

/** Identidad del build que está ejecutando este navegador. */
export const APP_BUILD = {
  /** SHA corto del commit compilado, o \`desconocido\` fuera de git/CI. */
  sha: '${sha}',
  /** Momento de la compilación, en ISO-8601 UTC. */
  compiladoEn: '${compiladoEn}',
} as const;
`;

mkdirSync(CARPETA, { recursive: true });
writeFileSync(DESTINO, contenido);
console.log(`· Sello de build: ${sha} (${compiladoEn})`);
