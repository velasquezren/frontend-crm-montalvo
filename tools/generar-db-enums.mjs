#!/usr/bin/env node
/**
 * Genera src/app/core/api/db-enums.ts a partir de schema.prisma.
 *
 *   node tools/generar-db-enums.mjs            → reescribe el archivo
 *   node tools/generar-db-enums.mjs --check    → falla (exit 1) si está desactualizado
 *
 * El backend vive en un repositorio hermano. Si no está presente (por ejemplo
 * en el build de Vercel, que solo clona el frontend) el script no hace nada y
 * termina con éxito: la verificación es una red de seguridad para desarrollo,
 * no un requisito de despliegue.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SCHEMA =
  process.env.PRISMA_SCHEMA ??
  resolve(RAIZ, '..', 'backend-crm-montalvo', 'prisma', 'schema.prisma');
const DESTINO = resolve(RAIZ, 'src', 'app', 'core', 'api', 'db-enums.ts');

const modoCheck = process.argv.includes('--check');

if (!existsSync(SCHEMA)) {
  console.log(`· schema.prisma no encontrado (${SCHEMA}) — se omite la verificación de tipos.`);
  process.exit(0);
}

/** Extrae los bloques `enum Nombre { VALOR ... }` respetando el orden del schema. */
function leerEnums(schema) {
  const enums = [];
  for (const bloque of schema.matchAll(/enum\s+(\w+)\s*\{([^}]*)\}/g)) {
    const valores = bloque[2]
      .split('\n')
      .map(linea => linea.replace(/\/\/.*$/, '').trim())
      .filter(linea => /^[A-Za-z_]\w*$/.test(linea));
    if (valores.length > 0) {
      enums.push({ nombre: bloque[1], valores });
    }
  }
  return enums;
}

function generar(enums) {
  const cabecera = [
    '/**',
    ' * ARCHIVO GENERADO — NO EDITAR A MANO.',
    ' *',
    ' * Fuente de verdad: backend-crm-montalvo/prisma/schema.prisma',
    ' * Regenerar:  npm run sync:tipos',
    ' * Verificar:  npm run check:tipos   (falla si el schema cambió y esto no)',
    ' */',
    '',
  ];

  const cuerpo = enums.map(({ nombre, valores }) => {
    const union = valores.map(v => `'${v}'`);
    const enLinea = `export type ${nombre} = ${union.join(' | ')};`;
    return enLinea.length <= 100
      ? enLinea
      : `export type ${nombre} =\n  | ${union.join('\n  | ')};`;
  });

  return `${cabecera.join('\n')}${cuerpo.join('\n\n')}\n`;
}

const enums = leerEnums(readFileSync(SCHEMA, 'utf8'));
const generado = generar(enums);

if (modoCheck) {
  const actual = existsSync(DESTINO) ? readFileSync(DESTINO, 'utf8') : '';
  if (actual !== generado) {
    console.error(
      '\n✗ db-enums.ts está desincronizado con schema.prisma.\n' +
        '  El schema cambió y los tipos del frontend no.\n' +
        '  Ejecuta:  npm run sync:tipos\n',
    );
    process.exit(1);
  }
  console.log(`✓ db-enums.ts sincronizado con schema.prisma (${enums.length} enums).`);
  process.exit(0);
}

writeFileSync(DESTINO, generado, 'utf8');
console.log(`✓ db-enums.ts generado desde schema.prisma (${enums.length} enums).`);
