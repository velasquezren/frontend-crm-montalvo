# CRM_MANIFESTO.md: Arquitectura y Principios

Contrato de diseño de ambos repos. Las instrucciones operativas están en
[CLAUDE.md](CLAUDE.md); implementación y contratos HTTP se comprueban en código,
schema, migraciones y tests. Las skills explican patrones, pero sus validadores
no comprueban toda su prosa. Un conflicto exige evidencia, no precedencia ciega.

## 1. Arquitectura del Sistema (Límites de Dominio e Integridad)

### 1.1 Backend (NestJS + Prisma + PostgreSQL)

- Cada dominio tiene su módulo y es dueño de sus escrituras. Las mutaciones
  ajenas pasan por el service dueño; las lecturas agregadas entre dominios son
  válidas. Excepciones deliberadas: [PANORAMA](../backend-crm-montalvo/docs/PANORAMA.md#quién-escribe-cada-tabla).
- Validar entradas en la frontera: DTO y validadores, firma de webhooks y
  contratos de las integraciones. El servidor controla permisos y alcance.
- Prisma describe la persistencia del CRM y los enums compartidos; los DTO y
  modelos de respuesta describen contratos distintos, no copias de tablas.
  MySQL de agenda y el portal Resultados conservan sus propios contratos.
- Cambios de persistencia con migraciones revisadas; no reconstruir datos
  clínicos ni financieros por inferencia.

### 1.2 Frontend (Angular)

- `core/`: servicios transversales; `shared/`: piezas reutilizables;
  `features/`: dominios. Cada endpoint tiene un servicio dueño.
- Una página consume el servicio del dominio, nunca `HttpClient` o URLs
  directas. Lecturas reactivas con peticiones del servicio y `httpResource` en
  la vista; comandos con `Promise`, recarga y `mensajeDeError`.
- Una pantalla puede reunir dominios cuando la tarea lo necesita: el hub
  `/finanzas` es una decisión vigente, no deuda por corregir.
- Buscar piezas existentes antes de crear otras. Si se repite marcado con
  comportamiento, extraer componente; si solo se repite estilo, utilidad CSS.

## 2. Angular moderno

Standalone implícito, `OnPush`, inyección `inject`, entradas/salidas signal,
control flow nativo con `track` estable. Estado local con signals y derivados
puros con `computed`; `effect` para efectos, no para derivar estado. RxJS para
streams e interoperabilidad, no un segundo almacén de estado local.

Rutas y carga diferida según [app.routes.ts](src/app/app.routes.ts); no crear un
archivo de rutas por feature si una sola ruta existente basta. Formularios
nuevos pueden usar Signal Forms; mantener Reactive Forms donde corresponda.
La API se consulta en la referencia local y la versión instalada, no se copia
un ejemplo del manifiesto. Patrones concretos:
[crm-feature-page](.claude/skills/crm-feature-page/SKILL.md).

## 3. Sistema de Diseño e Identidad Visual

- **Clínica Montalvo**, Poppins y marca vigente; no sustituir por placeholders.
- Paleta cerrada, sin rojo/ámbar de alarma. Estados usan los tokens de marca;
  `critical` es negro. Nuevos matices se derivan de tokens, no hex sueltos.
- Botones en píldora, inputs suaves, tarjetas redondeadas y sombras sutiles.
- Valores exactos y utilidades en [styles.css](src/styles.css); catálogo y
  convenciones en [crm-design-system](.claude/skills/crm-design-system/SKILL.md).
  No mantener otra tabla de tokens, componentes o versiones en este documento.
- Móvil, teclado, foco visible, nombres accesibles y movimiento reducido;
  carga, error, vacío y contenido diferenciados en toda vista remota.
- Bs y formato es-BO en interfaz, con el pipe compartido. No confundirlo con
  los USD internos del motor de comisiones ni con fracciones porcentuales.

## 4. Reutilización y límites de cambio

Mantener límites de dominio, componentes compartidos y diseño existentes.
Una solicitud transversal autoriza trabajar en los módulos necesarios para
esa solicitud; no exige pedir de nuevo la misma autorización. Si aparece una
ampliación de alcance no solicitada, presentarla antes de implementarla.
No introducir dependencias externas sin autorización. Nunca aprovechar una
tarea de documentación para cambiar funcionalidades.

## 5. Verificación y continuidad

Los comandos, permisos de operación y selección de documentación están en
`CLAUDE.md` y `README.md` de cada repo. El [estado actual](../backend-crm-montalvo/docs/ESTADO_ACTUAL.md)
contiene pendientes vigentes; auditorías, planes fechados y el historial son
evidencia, no instrucciones para ejecutar fases antiguas.

Se conserva la decisión del 25/08 de no duplicar inventarios sin validador y
la aclaración del 29/09: el aislamiento de persistencia prohíbe escrituras
ajenas, no lecturas agregadas. La simplificación documental del 15/10 elimina
ejemplos contradictorios; no cambia la arquitectura del CRM.
