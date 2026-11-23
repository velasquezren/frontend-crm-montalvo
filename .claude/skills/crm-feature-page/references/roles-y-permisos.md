# Roles y permisos

> Parte de la skill `crm-feature-page`: lee antes su [índice](../SKILL.md).

La jerarquía es `RECEPCION` y `ASISTENTE` (0) < `AGENTE` (1) < `ADMIN` (2) < `SUPER_ADMIN` (3). Recepción entra en conversaciones y solo atiende sus líneas autorizadas; el backend aplica los permisos. La jerarquía vive en
`core/auth/roles.ts` y es espejo de `common/auth/roles.ts` del backend — **si añades un rol,
tócalo en los dos lados**, y regenera `core/api/db-enums.ts` con `npm run sync:tipos` (el build
lo verifica).

#### El espejo lo comprueba el build (2026-10-09)

«Tócalo en los dos lados» es una instrucción que se olvida, así que `check:skills`
contrasta los dos archivos y falla si no dicen lo mismo:

```
RANGO_ROL · ROLES_OPERATIVOS · ROLES_ENTREGA_RESULTADOS · ROLES_ADMINISTRAN_AGENDA
```

**Añadir** un rol ya estaba cubierto por los tipos: `RolUsuario` sale del
`db-enums.ts` generado y `RANGO_ROL` es un `Record` exhaustivo, así que falta un
rango y el build cae solo. Lo que no estaba cubierto es cambiar la
**pertenencia** a una lista —que asistencia pase a administrar la agenda, por
ejemplo—: ahí los dos archivos compilan, los dos pasan sus pruebas, y se
contradicen. El síntoma no es una excepción: es un botón que devuelve 403, o
algo escondido que el usuario sí podía hacer.

El validador imprime las dos listas cuando difieren, y **el backend manda**: si
el aviso aparece, el que se corrige es este repo, salvo que el cambio se hubiera
hecho aquí a propósito.

#### Cuando el rango NO alcanza: `NavItem.roles`

`ASISTENTE` comparte rango con recepción y está **por debajo** de un agente de ventas, pero es
—junto con administración— quien entrega resultados. Ningún `rolMinimo` expresa eso: pedir
`RECEPCION` admite a todos y pedir `AGENTE` deja fuera al asistente. Para ese caso el ítem de
menú acepta además una lista explícita:

```ts
{ path: '/resultados', label: 'Entrega de Resultados', icon: 'file-text',
  rolMinimo: 'ADMIN', roles: ['ASISTENTE'] }
```

Se ve si cubre `rolMinimo` **o** si su rol está en `roles`. Es la excepción, no la norma: para
todo lo demás, `rolMinimo`. Y ocultar el menú no es el permiso — quien autoriza de verdad es el
backend, que en `/resultados` exige las dos cosas: `puedeEntregarResultados(rol)` **y** acceso a
la línea de resultados.

**Solo la membresía no bastaba (2026-09-22).** La línea de resultados es la de Recepción, que
también atienden recepcionistas y algún agente de ventas; en producción un AGENTE con esa línea
podía entregar informes médicos. Por eso hay tres piezas que dicen lo mismo y una prueba
(`resultados.page.spec.ts`) que las ata para los cinco roles: el ítem de menú, el guard
`exigeEntregaResultados` de la ruta y `puedeEntregarResultados` de `core/auth/roles.ts`.

#### Capacidades por rol: funciones de `core/auth/roles.ts`, nunca literales

| Pregunta | Función |
|---|---|
| ¿Alcanza este nivel? | `cubreRol(rol, 'AGENTE')` |
| ¿Atiende líneas sin alcance comercial (recepción, asistente)? | `esRolOperativo(rol)` |
| ¿Entrega resultados médicos? | `puedeEntregarResultados(rol)` |
| ¿Ve la agenda completa de la clínica (Reservas)? | `puedeVerAgendaClinica(rol)` — recepción, asistencia y ADMIN+; guard `exigeAgendaClinica` |

`rol === 'RECEPCION'` escrito en una vista es una tabla de permisos paralela: al añadir ASISTENTE
había tres en este frontend y las tres lo dejaron fuera (no se podía crear la cuenta, el formulario
le ofrecía la línea comercial y el selector de Actividades llamaba endpoints de ventas).
**`check:skills` rechaza comparar un rol con un literal** en `.ts`/`.html`; lo escrito entre
comillas invertidas no cuenta, para que los comentarios puedan citar el patrón.

El **backend** es la autoridad: acota por rol según el JWT y bloquea con `@Roles`.
El frontend solo *oculta* lo que no aplica:

- `authService.isAdmin()` / `isSuperAdmin()` para mostrar u ocultar acciones.
- `exigeRol('ADMIN')` o `exigeRol('SUPER_ADMIN')` como `canActivate` de la ruta.
- `rolMinimo` en `NAV_ITEMS` para ocultar la entrada del sidebar.

```ts
{ path: 'agentes', canActivate: [exigeRol('SUPER_ADMIN')], loadComponent: … }
```

`exigeRol` sustituyó a los guards por rol, que eran el mismo archivo copiado cambiando una
comparación: cada copia era un lugar más donde olvidar un rol nuevo. Por eso **no escribas un
guard de rol a mano** — usa la fábrica.

Como la comparación es por **rango mínimo**, pedir `ADMIN` deja pasar también al `SUPER_ADMIN`
sin enumerarlo. Nunca compares `rol === 'ADMIN'` a mano: eso deja fuera al super admin y es
exactamente el bug que la jerarquía existe para prevenir. Mismo error, versión
"mostrar texto": para pintar el rol como etiqueta (no para decidir acceso), usa
`ROL_LABEL[rol]`, nunca un `if`/`switch` a mano — una comparación manual ahí
dejó una vez a un SUPER_ADMIN etiquetado como "Agente" en pantalla.

Ocultar en el frontend nunca es suficiente: si un endpoint nuevo es sensible, verifica que el
backend también lo restrinja. Al revés también rompe: `/desempeno-agentes` quedó sin
`canActivate` un tiempo —el backend restringía bien, pero la ruta era visible para
cualquier rol— y un agente que entraba ahí veía una pantalla en blanco con cada
petición cayendo en 403 suyo, sin ninguna pista de qué había pasado. Toda ruta
sensible necesita su guardia en `app.routes.ts` aunque el backend ya la
proteja: la protección del backend evita la fuga de datos, no la pantalla rota.
