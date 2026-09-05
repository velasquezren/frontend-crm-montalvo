import { Pipe, PipeTransform } from '@angular/core';

import { inicialesCliente, nombreParaMostrar } from '../models/nombre-cliente';

/** Lo mínimo para escribir a un contacto en pantalla. */
type ContactoVisible = { nombre: string; telefono: string };

/**
 * Los dos pipes viven en el mismo archivo a propósito: dicen la misma regla
 * desde dos sitios —el nombre y sus iniciales— y tienen que coincidir. Si en
 * una vista el título dice "+591 71836560" y el avatar dice "W+", el que se
 * olvidó es uno de los dos.
 *
 * Son **puros**: se recalculan solo cuando cambia la referencia del cliente, no
 * en cada ciclo de detección. Un método del componente llamado desde la
 * plantilla (`{{ nombreDe(cli) }}`) se ejecuta en todos, y estas expresiones
 * están dentro de tablas de 25 filas y del inbox.
 *
 * Ver `shared/models/nombre-cliente.ts` para el porqué de la regla.
 */
@Pipe({ name: 'nombreCliente' })
export class NombreClientePipe implements PipeTransform {
  transform(cliente: ContactoVisible): string {
    return nombreParaMostrar(cliente);
  }
}

/** Iniciales del avatar, coherentes con lo que muestra `nombreCliente`. */
@Pipe({ name: 'inicialesCliente' })
export class InicialesClientePipe implements PipeTransform {
  transform(cliente: ContactoVisible): string {
    return inicialesCliente(cliente);
  }
}
