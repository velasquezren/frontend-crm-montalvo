# Guía común para asistentes de IA — frontend

Esta guía sirve como punto de entrada para Claude, Codex, Gemini, Copilot, Cursor,
Antigravity y asistentes que pueden leer archivos del repositorio. Las reglas del
CRM no dependen del proveedor del modelo.

## Al comenzar una tarea

1. Lee `CLAUDE.md` para las reglas operativas, comandos y problemas conocidos.
2. Lee `CRM_MANIFESTO.md` para los principios comunes de arquitectura y diseño.
3. Lee `../backend-crm-montalvo/docs/PANORAMA.md` y
   `../backend-crm-montalvo/docs/ESTADO_ACTUAL.md` para entender el CRM y el
   trabajo vigente. El segundo documento es el único handoff de fases.
4. Consulta las skills `.claude/skills/*/SKILL.md` pertinentes. Si tu herramienta
   no las carga automáticamente, léelas como documentos; para Angular también
   puedes consultar `.agents/skills/angular-developer/SKILL.md`.
5. Comprueba `git status` y el historial remoto de ambos repos antes de editar.
   El backend y el frontend viven en repositorios hermanos que se actualizan desde
   más de una máquina.

## Reglas compartidas

- Frontend: Angular 21, signals, `OnPush`, Tailwind v4 y PWA. Sigue las reglas de
  `CLAUDE.md`, el manifesto y las skills del área que toques.
- El backend es la autoridad de permisos y datos. Ocultar un control en la UI no
  constituye control de acceso.
- No hay staging y el CRM atiende pacientes reales. Evita cambios especulativos
  y publica solo siguiendo el procedimiento del proyecto.
- `npm run build` es la comprobación oficial del frontend; `npm test
  -- --watch=false` ejecuta Vitest. Usa las verificaciones apropiadas para el
  cambio y respeta las instrucciones del repositorio.
- `db-enums.ts` y otros artefactos indicados como generados no se editan a mano.
  El build y sus validadores son la referencia para los contratos.
- Nunca copies credenciales o datos reales de pacientes en prompts, ejemplos,
  logs o archivos versionados.

## Puntos de entrada por herramienta

- Claude Code: `CLAUDE.md` y `.claude/skills/`.
- Gemini CLI: `GEMINI.md`.
- Codex y agentes que admiten instrucciones de repositorio: `AGENTS.md`.
- GitHub Copilot: `.github/copilot-instructions.md`.
- Cursor: `.cursor/rules/crm.mdc`.
- Cualquier otro asistente: pídele que lea este archivo y `AGENTS.md` antes de
  trabajar. Si admite instrucciones persistentes, configura `AI_GUIDE.md` como
  contexto del proyecto.

Las skills son Markdown normal y sus reglas se pueden seguir con cualquier
modelo; solo su carga automática depende de la herramienta.

## VPS

En esta estación SSH tiene el alias local `montalvo-vps`. La IA puede usarlo
para las tareas remotas que el usuario solicite; no guardes ni muestres
contraseñas, claves privadas, `.env` ni datos de pacientes. Ese VPS es
producción, no staging: desarrolla en el repositorio local y sigue el
procedimiento documentado para desplegar. No modifiques archivos desplegados,
reinicies servicios, ejecutes migraciones ni borres datos sin una petición
explícita para esa acción.

La conexión no interactiva de la IA todavía puede requerir que se autorice la
clave pública en el VPS. Si SSH responde `Permission denied`, informa del fallo;
no pidas ni guardes la contraseña en un prompt o archivo.
