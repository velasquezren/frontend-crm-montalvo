# Un endpoint tiene UN dueño, porque dos dueños son dos contratos

> Parte de la skill `crm-feature-page`: lee antes su [índice](../SKILL.md).

«Una página nunca construye URLs» no dice qué pasa cuando **dos servicios**
declaran la misma. Y ahí el daño no es la copia de la URL: es que cada dueño
declara también el **tipo** de la respuesta, y los tipos divergen sin que nada
avise.

**El caso (2026-10-09).** `GET /conversaciones/meta/agentes` lo declaraban tres
servicios y tenía **cuatro contratos** en el frontend:

| Quién | Tipo | Campos |
|---|---|---|
| inbox, Clientes | `AgenteResumen` | id · nombre · `rol: Rol` · `lineasWhatsapp` |
| Ventas | `AgenteResumenVenta` | id · nombre · **`email?`** · `rol?: string` |
| Actividades | *(anónimo)* | id · nombre |

El backend (`findAgentes`) selecciona `{ id, nombre, rol, lineasWhatsapp }` y
**nunca manda `email`**. Nadie lo leía, así que no se veía: un campo fantasma no
da error, da `undefined` para siempre. Y `rol?: string` perdía el enum, que es
justo lo que impide comparar roles a mano.

La forma correcta, y la que ya seguía Clientes:

- **El contrato, uno solo**, en `shared/models/` si lo piden varias features
  (`shared/models/agente.ts`). Sus campos son los del `select` del backend, ni
  uno más: si no está allá, no se declara.
- **La URL, en el servicio dueño** del endpoint. El resto lo pide **inyectando
  ese servicio** — entre features ya es el patrón normal aquí (Actividades y
  Ventas inyectan `ClientesService`; Campañas, `ConversacionesService`).

`check:skills` lo comprueba (`verificarDuenoDeEndpoint`): un endpoint declarado
en dos servicios rompe el build, y nombra los dos. `/planilla-comisiones/periodos`
está congelado en tres —**Finanzas y Comisiones están cerradas** por decisión del
propietario— y esa cifra solo puede bajar.
