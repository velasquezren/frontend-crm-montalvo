/** Comprobaciones estáticas de UI con los parsers ya instalados. Sin navegador. */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { parseTemplate } from '@angular/compiler';
import postcss from 'postcss';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Hallazgos tolerados por archivo y regla: congelados, solo pueden bajar (el
 * mismo trato que `DEUDA` en verificar-skills.mjs). Finanzas y comisiones no se
 * tocan salvo pedido explícito, así que lo suyo se congela en vez de corregirse.
 */
const DEUDA = {
  'src/app/features/finanzas/components/tipo-cambio/tipo-cambio-admin.component.html': { 'nombre-repetido': 1 },
};

function hijos(node) {
  return ['children', 'branches', 'groups', 'cases', 'empty', 'placeholder', 'loading', 'error']
    .flatMap(key => node[key] ? (Array.isArray(node[key]) ? node[key] : [node[key]]) : []);
}

export function revisarPlantilla(texto, archivo = 'plantilla.html') {
  const ast = parseTemplate(texto, archivo, { preserveWhitespaces: true });
  const problemas = (ast.errors ?? []).map(error => ({ linea: error.span.start.line + 1, regla: 'sintaxis', mensaje: error.msg }));
  /* `enBucle`: dentro de un @for, un nombre fijo se repite en cada fila. */
  const recorrer = (nodes, enBucle = false) => {
    for (const node of nodes) {
      if (node.name && node.attributes && node.inputs) {
        const atributo = name => node.attributes.find(a => a.name === name);
        const enlazado = name => node.inputs.some(a => a.name === name);
        const tiene = name => !!atributo(name) || enlazado(name);
        const nombre = name => !!atributo(name)?.value.trim() || enlazado(name);
        const reportar = (regla, mensaje) => problemas.push({ linea: node.sourceSpan.start.line + 1, regla, mensaje });
        const rol = atributo('role')?.value;
        if (['app-input', 'app-select', 'app-switch'].includes(node.name)
            && !nombre('label') && !nombre('ariaLabel')) {
          reportar('nombre-control', `<${node.name}> necesita label o ariaLabel.`);
        }
        if (node.name === 'app-input') {
          /* El tipo decide el teclado del teléfono: un celular en `text` abre el
             teclado de letras. Se mira el nombre visible o accesible estático. */
          const rotulo = `${atributo('label')?.value ?? ''} ${atributo('ariaLabel')?.value ?? ''}`;
          const tipo = atributo('type')?.value ?? (enlazado('type') ? null : 'text');
          const esperado = /tel[eé]fono|celular|whatsapp/i.test(rotulo) ? 'tel'
            : /correo|e-?mail/i.test(rotulo) ? 'email' : null;
          /* `type="text"` escrito a mano es una decisión («Nombre de la línea
             WhatsApp»); la regla solo atrapa el tipo olvidado. */
          const explicito = atributo('type')?.value === 'text';
          if (esperado && tipo !== null && tipo !== esperado && tipo !== 'search' && !explicito) {
            reportar('tipo-campo', `El campo «${rotulo.trim()}» debe ser type="${esperado}" para abrir el teclado correcto.`);
          }
        }
        if (node.name === 'app-button' && tiene('icon') && !nombre('ariaLabel')) {
          const contenido = texto.slice(node.startSourceSpan.end.offset, node.endSourceSpan?.start.offset ?? node.startSourceSpan.end.offset)
            .replace(/<!--[\s\S]*?-->/g, '').trim();
          if (!contenido) reportar('nombre-control', 'Un botón solo-ícono necesita ariaLabel.');
        }
        if (enBucle && ['app-button', 'button', 'a'].includes(node.name)
            && (atributo('ariaLabel') ?? atributo('aria-label'))?.value.trim()) {
          reportar('nombre-repetido', 'Dentro de un @for el nombre accesible fijo se repite en cada fila: inclúyele el dato de la fila con [ariaLabel].');
        }
        if (node.name === 'img' && !tiene('alt')) reportar('imagen-alt', 'La imagen necesita alt, vacío si es decorativa.');
        if (node.name === 'input' && atributo('type')?.value === 'file'
            && /(?:^|\s)hidden(?:\s|$)/.test(atributo('class')?.value ?? '')) {
          reportar('archivo-teclado', 'El selector de archivo debe usar sr-only y un foco visible en su envoltorio.');
        }
        if (node.name === 'th' && rol === 'button') reportar('cabecera-tabla', 'Conserva la semántica th y coloca un botón nativo dentro.');
        if (node.name === 'th' && node.outputs.some(o => o.name === 'click')) {
          reportar('ordenacion-teclado', 'Usa th[appOrdenable] para que la cabecera se alcance con teclado.');
        }
        if (['dialog', 'alertdialog'].includes(rol) && !tiene('cdkTrapFocus')) {
          reportar('dialogo-foco', 'El diálogo debe retener el foco con cdkTrapFocus.');
        }
        if (rol === 'tablist' && !tiene('appTablist') && !node.outputs.some(o => o.name.startsWith('keydown'))) {
          reportar('pestanas-teclado', 'La lista de pestañas necesita navegación por teclado.');
        }
        if (rol === 'tab' && !tiene('tabindex') && !tiene('tabIndex')) {
          reportar('pestanas-tab', 'Las pestañas deben tener una sola parada de Tab con tabindex.');
        }
      }
      /* El @empty de un @for se pinta una sola vez: no es una fila. */
      const esFor = 'trackBy' in node && 'item' in node;
      if (esFor) {
        recorrer(node.children ?? [], true);
        if (node.empty) recorrer([node.empty], enBucle);
      } else {
        recorrer(hijos(node), enBucle);
      }
    }
  };
  recorrer(ast.nodes);
  return problemas;
}

export function revisarCss(texto, archivo = 'estilos.css', sinEncapsulacion = false) {
  const problemas = [];
  let ast;
  try { ast = postcss.parse(texto, { from: archivo }); }
  catch (error) { return [{ linea: error.line ?? 1, regla: 'css-sintaxis', mensaje: error.reason }]; }
  ast.walkRules(rule => {
    if (sinEncapsulacion && rule.selector.includes(':host')) {
      problemas.push({ linea: rule.source.start.line, regla: 'css-host', mensaje: ':host no funciona con ViewEncapsulation.None. Usa el selector del componente.' });
    }
    const vistas = new Set();
    for (const decl of rule.nodes.filter(n => n.type === 'decl')) {
      const clave = `${decl.prop}:${decl.value}:${decl.important}`;
      if (vistas.has(clave)) problemas.push({ linea: decl.source.start.line, regla: 'css-duplicado', mensaje: `Declaración duplicada: ${decl.prop}: ${decl.value}.` });
      vistas.add(clave);
    }
  });
  return problemas;
}

/**
 * Una pestaña o un panel cuyo primer elemento es `flex-1 overflow-y-auto` solo
 * desplaza si su etiqueta es una columna flex que encoge: sin eso, el `flex-1`
 * no tiene padre flex, la etiqueta crece con el contenido y el cajón, que corta
 * lo que sobra, deja el final fuera de la vista y sin poder llegar a él. Así
 * estaban Servicios y WhatsApp en la ficha del médico (2026-10-20); Web y los
 * cupos del chat ya llevaban `host: { class: 'flex-1 min-h-0 flex flex-col' }`.
 */
export function revisarRaizDesplazable(plantilla, claseHost, archivo = 'plantilla.html') {
  const primero = nodos => {
    for (const node of nodos) {
      if (node.name && node.attributes) return node;
      if (typeof node.value === 'string' && !node.value.trim()) continue;
      if (node.value !== undefined) return undefined;
      const dentro = primero(hijos(node));
      if (dentro) return dentro;
    }
    return undefined;
  };
  const raiz = primero(parseTemplate(plantilla, archivo, { preserveWhitespaces: true }).nodes);
  const clases = new Set((raiz?.attributes.find(a => a.name === 'class')?.value ?? '').split(/\s+/));
  if (!clases.has('flex-1') || !clases.has('overflow-y-auto')) return [];
  const host = new Set((claseHost ?? '').split(/\s+/));
  const faltan = ['flex', 'flex-col', 'flex-1', 'min-h-0'].filter(c => !host.has(c));
  return faltan.length === 0 ? [] : [{
    linea: raiz.sourceSpan.start.line + 1,
    regla: 'raiz-desplazable',
    mensaje: `La raíz desplaza (flex-1 overflow-y-auto) pero la etiqueta del componente no es una columna que encoge: añade host: { class: 'flex-1 min-h-0 flex flex-col' } (falta ${faltan.join(', ')}).`,
  }];
}

/** Extrae solo los literales de @Component, no HTML de comentarios ni de tests. */
export function componentesDe(texto, archivo) {
  const ast = ts.createSourceFile(archivo, texto, ts.ScriptTarget.Latest, true);
  const componentes = [];
  const visitar = node => {
    if (ts.isDecorator(node) && ts.isCallExpression(node.expression)
        && node.expression.expression.getText(ast) === 'Component') {
      const config = node.expression.arguments[0];
      if (config && ts.isObjectLiteralExpression(config)) {
        const props = Object.fromEntries(config.properties.filter(ts.isPropertyAssignment).map(p => [p.name.getText(ast), p.initializer]));
        const literal = n => n && (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n))
          ? { texto: n.text, linea: ast.getLineAndCharacterOfPosition(n.getStart(ast)).line } : undefined;
        const host = props.host && ts.isObjectLiteralExpression(props.host)
          ? props.host.properties.filter(ts.isPropertyAssignment).find(p => p.name.getText(ast).replace(/['"]/g, '') === 'class')
          : undefined;
        componentes.push({
          template: literal(props.template),
          templateUrl: literal(props.templateUrl),
          claseHost: literal(host?.initializer)?.texto,
          styles: props.styles && ts.isArrayLiteralExpression(props.styles) ? props.styles.elements.map(literal).filter(Boolean) : [literal(props.styles)].filter(Boolean),
          styleUrls: props.styleUrls && ts.isArrayLiteralExpression(props.styleUrls) ? props.styleUrls.elements.map(literal).filter(Boolean) : [literal(props.styleUrl)].filter(Boolean),
          sinEncapsulacion: props.encapsulation?.getText(ast) === 'ViewEncapsulation.None',
          onPush: props.changeDetection?.getText(ast) === 'ChangeDetectionStrategy.OnPush',
        });
      }
    }
    ts.forEachChild(node, visitar);
  };
  visitar(ast);
  return componentes;
}

function archivosDe(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = resolve(dir, entry.name);
    return entry.isDirectory() ? archivosDe(path) : [path];
  });
}

export function verificarUi(raiz = RAIZ) {
  const problemas = [];
  const agregar = (archivo, hallazgos, offset = 0) => problemas.push(...hallazgos.map(h => ({ ...h, archivo: relative(raiz, archivo), linea: h.linea + offset })));
  const archivos = archivosDe(resolve(raiz, 'src/app')).filter(f => !f.endsWith('.spec.ts'));
  const globales = new Set();
  let componentes = 0;
  for (const archivo of archivos.filter(f => f.endsWith('.ts'))) {
    for (const c of componentesDe(readFileSync(archivo, 'utf8'), archivo)) {
      componentes++;
      if (!c.onPush) agregar(archivo, [{ linea: 1, regla: 'onpush', mensaje: 'El componente debe conservar ChangeDetectionStrategy.OnPush.' }]);
      if (c.template) agregar(archivo, revisarPlantilla(c.template.texto, archivo), c.template.linea);
      if (c.template) agregar(archivo, revisarRaizDesplazable(c.template.texto, c.claseHost, archivo), c.template.linea);
      if (c.templateUrl) {
        const html = resolve(dirname(archivo), c.templateUrl.texto);
        agregar(html, revisarRaizDesplazable(readFileSync(html, 'utf8'), c.claseHost, html));
      }
      for (const s of c.styles) agregar(archivo, revisarCss(s.texto, archivo, c.sinEncapsulacion), s.linea);
      if (c.sinEncapsulacion) for (const s of c.styleUrls) globales.add(resolve(dirname(archivo), s.texto));
    }
  }
  for (const archivo of archivos) {
    if (archivo.endsWith('.html')) agregar(archivo, revisarPlantilla(readFileSync(archivo, 'utf8'), archivo));
    if (archivo.endsWith('.css')) agregar(archivo, revisarCss(readFileSync(archivo, 'utf8'), archivo, globales.has(archivo)));
  }
  const estilos = resolve(raiz, 'src/styles.css');
  agregar(estilos, revisarCss(readFileSync(estilos, 'utf8'), estilos));
  return { problemas: aplicarDeuda(problemas, raiz === RAIZ ? DEUDA : {}), componentes };
}

export function aplicarDeuda(problemas, deuda) {
  const cuenta = (archivo, regla) => problemas.filter(p => p.archivo === archivo && p.regla === regla).length;
  const restantes = problemas.filter(p => cuenta(p.archivo, p.regla) > (deuda[p.archivo]?.[p.regla] ?? 0));
  for (const [archivo, reglas] of Object.entries(deuda)) {
    for (const [regla, tolerado] of Object.entries(reglas)) {
      const hallados = cuenta(archivo, regla);
      if (hallados < tolerado) {
        restantes.push({ archivo, linea: 1, regla: 'deuda', mensaje: `mejoró a ${hallados} «${regla}»: baja DEUDA de tools/verificar-ui.mjs a ${hallados}.` });
      }
    }
  }
  return restantes;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { problemas, componentes } = verificarUi();
  for (const p of problemas) console.error(`${p.archivo}:${p.linea} [${p.regla}] ${p.mensaje}`);
  if (problemas.length) process.exitCode = 1;
  else console.log(`✓ UI estática: ${componentes} componentes, plantillas externas/inline y CSS. Sin validación visual.`);
}
