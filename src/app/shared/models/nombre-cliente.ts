import { generarIniciales } from '../../core/auth/user.model';

/**
 * Prefijo con el que el backend da de alta a quien escribe por WhatsApp sin que
 * Meta mande su nombre de perfil (ver `ClientesService.nombreProvisional` en el
 * repo hermano). No es un nombre: es un marcador a la espera de uno.
 */
const PREFIJO_PROVISIONAL = 'WhatsApp ';

/** ¿Este "nombre" es el marcador del backend y no el de una persona? */
export function esNombreProvisional(nombre: string): boolean {
  return nombre.startsWith(PREFIJO_PROVISIONAL);
}

/**
 * Cómo se escribe este contacto en pantalla.
 *
 * Un marcador `WhatsApp +59171836560` puesto donde va un nombre deja la ficha
 * diciendo el mismo teléfono dos veces —una como título y otra como dato— y con
 * la palabra "WhatsApp" haciendo de nombre de pila. Se ve mal y además informa
 * mal: lo que hay que saber de esa paciente es que **todavía no dio su nombre**,
 * no por qué canal llegó.
 *
 * Devolver el teléfono a secas deja el título limpio y libera la línea de datos
 * para decir lo que sí falta. Vive en `shared/` y no en la *feature* de clientes
 * porque el mismo contacto se pinta en el inbox, en leads, en ventas y en la
 * campana de recordatorios: si cada vista lo resuelve a su manera, vuelve a
 * aparecer el marcador en la que se olvide.
 */
export function nombreParaMostrar(cliente: { nombre: string; telefono: string }): string {
  return esNombreProvisional(cliente.nombre) ? cliente.telefono : cliente.nombre;
}

/**
 * Iniciales para el avatar de un contacto.
 *
 * `generarIniciales('WhatsApp +59171836560')` devuelve **W+**, que no son las
 * iniciales de nadie: son la primera letra del canal y el signo del prefijo
 * internacional. Un contacto sin nombre se dibuja como lo que es, un
 * interrogante, en vez de fingir unas iniciales.
 */
export function inicialesCliente(cliente: { nombre: string; telefono: string }): string {
  return esNombreProvisional(cliente.nombre) ? '?' : generarIniciales(cliente.nombre);
}
