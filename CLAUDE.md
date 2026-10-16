# CRM Clínica Montalvo — frontend

Angular, signals, OnPush, Tailwind y PWA; backend NestJS en el repo hermano.
Esta es la entrada operativa común para Claude Code y los demás agentes.

## Orientación y fuentes

1. Comprueba `git status` y el historial; haz `git fetch` en los repos implicados
   antes de editar. Conserva trabajo local ajeno; no sincronices con reset.
2. Lee el [estado breve](../backend-crm-montalvo/docs/ESTADO_ACTUAL.md) y usa el [índice por tarea](../backend-crm-montalvo/docs/README.md) para elegir
   la sección necesaria. No cargues todas las auditorías ni todas las skills.
3. Busca primero la implementación y sus tests (`rg` y `git log --all -- <ruta>`).
   Un «pendiente» histórico no demuestra que falte la funcionalidad.

La petición actual fija el alcance. El contrato ejecutable (código, schema,
migraciones y tests) describe lo implementado; el [manifiesto](CRM_MANIFESTO.md) fija
los principios de arquitectura y marca. Las guías y skills explican decisiones.
Si discrepan, contrasta la evidencia: no cambies comportamiento solo para hacer
coincidir una frase, ni declares correcto un bug porque compila.
`check:skills` valida comprobaciones concretas, no toda la prosa ni producción.

## Límites operativos

- No hay staging; producción atiende pacientes reales. No desplegar, reiniciar,
  migrar, enviar mensajes ni cambiar Meta/VPS sin una petición que lo autorice.
  Un push a `main` del frontend publica en Vercel; el del backend no despliega.
- No copiar secretos, `.env` ni datos reales de pacientes a documentación,
  prompts, ejemplos o logs. El alias SSH local `montalvo-vps` no identifica por
  sí solo el servidor del CRM: distinguir CRM/Resultados de agenda ScriptCase.
- No usar navegador en este proyecto; comprobar UI desde código y declarar el
  límite. Para API, pruebas locales o `curl` contra desarrollo.
- Actualizar la guía propietaria cuando cambie un contrato. El historial no es
  una lista de órdenes; no crear un archivo de seguimiento por sesión.

## Reglas de implementación

- El backend es la autoridad de permisos y datos. Una página no inyecta
  `HttpClient` ni construye URLs: consume su servicio de dominio.
- `OnPush`, signals y control flow nativo; cuatro estados en vistas remotas
  (carga, error, vacío, contenido). Sin `any`, `console.log` ni colores ajenos.
- Antes de cambiar una vista/datos, consultar la sección necesaria de
  [crm-feature-page](.claude/skills/crm-feature-page/SKILL.md).
  HTML/CSS/controles: [crm-design-system](.claude/skills/crm-design-system/SKILL.md)
  y validación con [crm-ui-desde-codigo](.claude/skills/crm-ui-desde-codigo/SKILL.md).
  Chat, finanzas, leads o rendimiento tienen su propia skill: elegir en el índice.
- `db-enums.ts` se genera desde el schema del backend (`npm run sync:tipos`).
  `core/build/app-build.ts` también es generado e ignorado. Usar scripts npm,
  no `ng build`/`ng test` directos en un checkout limpio.

## Comprobación

Instalación y comandos: [README](README.md). Para código, `npm run build` es
la compuerta oficial, más tests pertinentes (`npm test -- --watch=false`) y
`check:tests` al cambiar pruebas. Para documentación, comprobar referencias,
`check:skills` y `git diff --check`; un build no valida comportamiento visual.

## Skills de terceros

La referencia Angular está en `.agents/skills/angular-developer/` (ruta relativa
al repo, no `/.agents/`). Consultar solo la API necesaria. `web-design-guidelines`
es apoyo opcional; la marca y los patrones del CRM prevalecen. No añadir librerías
de diseño ni cambiar la paleta por recomendación genérica de un proveedor.
