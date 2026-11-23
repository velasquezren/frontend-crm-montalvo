# Una regla de negocio escrita en dos vistas es una función pura compartida

> Parte de la skill `crm-feature-page`: lee antes su [índice](../SKILL.md).

Es el modo de fallo más silencioso de este frontend: cada vista necesita la
misma regla, ninguna sabe de las otras, y las copias divergen en el caso raro —
que es justo el que nadie prueba a ojo.

Barrido del 2026-09-14, con lo que salió:

| Regla | Copias | Cómo habían divergido |
|---|---|---|
| Enlace a WhatsApp | **4**, con dos nombres | Dos anteponían `591` «si faltaba»: un `+52…` de México salía `wa.me/5915215512345678`. **Enlace muerto, sin aviso** |
| `nombreMes` | **6** | Un mes fuera de 1-12 daba `Mes 13`, `13` o **cadena vacía** según la vista. La última dejaba una etiqueta de periodo en blanco en Comisiones |
| Campaña de origen | 2 | Una leía siete campos y la otra cuatro |
| Etiquetas de paciente | 2, con dos nombres | Aún idénticas — pero el siguiente arreglo entraba en una sola |
| Teléfono tecleado → E.164 | **5** (2026-09-28) | Dos aceptaban cualquier número de 8 dígitos y le pegaban `+591`; Leads normalizaba sin validar; Clientes y Resultados mandaban lo tecleado y un `70012345` volvía como error del backend. Hoy todas usan `telefonoParaEscribir` + `AVISO_TELEFONO_INVALIDO` (`shared/models/telefono.ts`) |
| Intereses sugeridos | 2 (2026-09-28) | El Registro presencial ofrecía los de una clínica **dental**; lo tocado quedaba guardado como interés. Hoy `INTERESES_SUGERIDOS` en `lead.model.ts` |

Todas viven ahora en `shared/models/` (o en `core/api/datos-extra.ts` cuando
derivan del JSON), con pruebas que fijan **el caso raro**, no el feliz.

**Cómo repetir el barrido** — busca cuerpos idénticos de 1 a 4 líneas en
archivos distintos:

```bash
python3 - <<'EOF'
import os, re, collections, hashlib
cuerpos = collections.defaultdict(list)
for raiz,_,archivos in os.walk('src/app'):
    for a in archivos:
        if not a.endswith('.ts') or a.endswith('.spec.ts'): continue
        ruta = os.path.join(raiz,a)
        for m in re.finditer(r'\n  (?:protected |private |public )?(\w+)\(([^)]*)\)(?:: [^{]+)?\{\n((?:.{0,200}\n){1,4}?)  \}\n', open(ruta).read()):
            cuerpo = m.group(3).strip()
            if len(cuerpo) >= 25:
                cuerpos[hashlib.md5(cuerpo.encode()).hexdigest()].append((m.group(1), a))
for usos in cuerpos.values():
    if len({u[1] for u in usos}) >= 2: print(usos[0][0], '→', sorted({u[1] for u in usos}))
EOF
```

**No todo lo que sale hay que extraer.** `togglePanel()` que hace
`this.state.panelAbierto.update(v => !v)` en dos sitios está bien duplicado:
extraerlo cuesta más de lo que ahorra. El criterio es si la duplicación puede
producir **dos respuestas distintas a la misma pregunta de negocio** — un enlace
de WhatsApp puede; un toggle de panel no.
