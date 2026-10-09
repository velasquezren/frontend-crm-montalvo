import { Rol } from '../../core/api/db-enums';

/**
 * Un agente tal como lo devuelve `GET /conversaciones/meta/agentes`: la lista
 * de personas activas que alimenta los desplegables de «quién atiende» y
 * «de quién es» en todo el CRM.
 *
 * Vive en `shared/models/` porque lo piden CUATRO pantallas —inbox, Clientes,
 * Ventas y Actividades— y ninguna es su dueña. Estaba declarado en
 * `features/conversaciones/conversacion.model.ts` y el resto lo importaba de
 * ahí o se escribía el suyo; el 2026-10-09 el mismo endpoint tenía **cuatro
 * contratos distintos**:
 *
 *   inbox y Clientes  AgenteResumen         id · nombre · rol: Rol · lineasWhatsapp
 *   Ventas            AgenteResumenVenta    id · nombre · email? · rol?: string
 *   Actividades       (tipo anónimo)        id · nombre
 *
 * Y uno mentía: el backend (`findAgentes`) selecciona
 * `{ id, nombre, rol, lineasWhatsapp }` y **nunca manda `email`**. Nadie lo
 * leía, así que no se veía —un campo fantasma no da error, da `undefined`—,
 * pero cualquiera que lo hubiera usado habría pintado un hueco para siempre.
 * `rol` como `string?` además perdía el enum, que es lo que impide comparar
 * roles a mano.
 *
 * Los campos son los del `select` del backend, ni uno más. Si se añade uno
 * allá, se añade aquí; si no está allá, no se declara.
 */
export interface AgenteResumen {
  readonly id: string;
  readonly nombre: string;
  readonly rol: Rol;
  readonly lineasWhatsapp: readonly { readonly lineaId: string }[];
}
