import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aplicarDeuda, componentesDe, revisarCss, revisarPlantilla } from './verificar-ui.mjs';

test('nombres: Angular control flow, comparaciones, inline y comentarios', () => {
  const html = `<!-- <app-input /> -->
    @if (total() > 0) { <app-input [label]="nombre()" /> }
    @for (fila of filas(); track fila.id) { <app-select placeholder="No es un nombre" /> }
    <app-button icon="x" ariaLabel="Cerrar" />
    <app-button icon="save">Guardar</app-button>
    <app-button icon="x" />
    <app-switch ariaLabel="Habilitar" />`;
  const problemas = revisarPlantilla(html);
  assert.equal(problemas.length, 2);
  assert.deepEqual(problemas.map(p => p.regla), ['nombre-control', 'nombre-control']);
});

test('no acepta un label vacío, title o placeholder como nombre', () => {
  for (const html of ['<app-input label="" />', '<app-select title="Periodo" />', '<app-switch />']) {
    assert.equal(revisarPlantilla(html)[0]?.regla, 'nombre-control');
  }
});

test('cubre ramas defer, placeholder, loading, error, switch y for empty', () => {
  const html = `@defer { <app-input /> } @placeholder { <app-input /> }
    @loading { <app-input /> } @error { <app-input /> }
    @switch (tipo()) { @case ('a') { <app-input /> } @default { <app-input /> } }
    @for (n of filas(); track n) { <app-input /> } @empty { <app-input /> }`;
  assert.equal(revisarPlantilla(html).filter(p => p.regla === 'nombre-control').length, 8);
});

test('detecta regresiones de teclado, imágenes y semántica de tabla', () => {
  const html = `<input type="file" class="hidden" /><img src="foto.png" />
    <div role="dialog"></div><nav role="tablist"><button role="tab">Datos</button></nav>
    <table><tr><th role="button">Nombre</th><th (click)="ordenar()">Total</th></tr></table>`;
  assert.deepEqual(revisarPlantilla(html).map(p => p.regla), [
    'archivo-teclado', 'imagen-alt', 'dialogo-foco', 'pestanas-teclado', 'pestanas-tab', 'cabecera-tabla', 'ordenacion-teclado',
  ]);
  assert.deepEqual(revisarPlantilla(`<input type="file" class="sr-only" /><img alt="" />
    <div role="dialog" cdkTrapFocus></div><nav role="tablist" appTablist>
    <button role="tab" [attr.tabindex]="activa() ? 0 : -1">Datos</button></nav>`), []);
});

test('extrae template y styles de Component, sin confundir comentarios', () => {
  const source = "/* template: '<app-input />' */\n@Component({ changeDetection: ChangeDetectionStrategy.OnPush, template: `<app-input ariaLabel=\"Buscar\" />`, styles: ['.dato { color: inherit; }'], styleUrl: './dato.css', encapsulation: ViewEncapsulation.None }) class Dato {}";
  const [c] = componentesDe(source, 'dato.ts');
  assert.equal(c.onPush, true);
  assert.equal(c.sinEncapsulacion, true);
  assert.equal(c.styleUrls[0].texto, './dato.css');
  assert.equal(c.styles.length, 1);
  assert.deepEqual(revisarPlantilla(c.template.texto), []);
});

test('CSS con nesting y @theme: rechaza duplicados exactos pero conserva fallbacks', () => {
  assert.deepEqual(revisarCss('@theme { --color-primary: #006156; } .a { display: block; display: grid; &:hover { color: inherit; } }'), []);
  assert.equal(revisarCss('.a { color: inherit; color: inherit; }')[0]?.regla, 'css-duplicado');
  assert.equal(revisarCss(':host { display: block; }', 'tabla.ts', true)[0]?.regla, 'css-host');
  assert.deepEqual(revisarCss(':host { display: block; }'), []);
  assert.equal(revisarCss('.a {')[0]?.regla, 'css-sintaxis');
});

test('teléfono y correo piden su teclado: type tel / email', () => {
  const html = `<app-input label="Teléfono / WhatsApp *" [(value)]="t" />
    <app-input ariaLabel="Correo Electrónico" />
    <app-input label="Celular" type="tel" /><app-input label="Email" type="email" />
    <app-input type="search" ariaLabel="Buscar por nombre, teléfono o PAC" />
    <app-input label="Nombre de la línea WhatsApp" type="text" />
    <app-input label="Nombre" />`;
  assert.deepEqual(revisarPlantilla(html).map(p => p.regla), ['tipo-campo', 'tipo-campo']);
});

test('dentro de un @for el nombre accesible lleva el dato de la fila', () => {
  const html = `@for (a of filas(); track a.id) {
      <app-button icon="edit" ariaLabel="Editar" />
      <app-button icon="edit" [ariaLabel]="'Editar ' + a.titulo" />
      <button aria-label="Borrar"></button>
    } @empty { <app-button icon="plus" ariaLabel="Crear la primera" /> }
    <app-button icon="x" ariaLabel="Cerrar" />`;
  assert.deepEqual(revisarPlantilla(html).map(p => p.regla), ['nombre-repetido', 'nombre-repetido']);
});

test('la deuda tolera hasta su cifra y exige bajarla si mejora', () => {
  const p = (archivo, regla) => ({ archivo, regla, linea: 1, mensaje: '' });
  assert.deepEqual(aplicarDeuda([p('a.html', 'x')], { 'a.html': { x: 1 } }), []);
  assert.equal(aplicarDeuda([p('a.html', 'x'), p('a.html', 'x')], { 'a.html': { x: 1 } }).length, 2);
  assert.equal(aplicarDeuda([], { 'a.html': { x: 1 } })[0]?.regla, 'deuda');
});
