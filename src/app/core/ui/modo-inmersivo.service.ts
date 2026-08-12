import { Injectable, signal } from '@angular/core';

/**
 * Pide al layout que se aparte: sin barra superior ni barra inferior.
 *
 * Existe para el chat en el teléfono. Ahí se apilaban cuatro barras —topbar de
 * la app, cabecera del chat, compositor y navegación inferior— que se comían
 * cerca del 20% de una pantalla de 812px, justo en la vista donde lo único que
 * importa es leer y escribir.
 *
 * **Solo tiene efecto por debajo de 768px**: quién lo aplica es el CSS del
 * layout, y en escritorio esas barras no molestan a nadie.
 *
 * No se quitan siempre, solo mientras hay un chat abierto. La barra superior es
 * lo único que abre el menú lateral en el móvil, y ahí viven el resto de vistas
 * (clientes, leads, ventas…) que la barra inferior no lista: esconderla de forma
 * permanente dejaría media aplicación inalcanzable. Dentro del chat sí sobra,
 * porque su propia cabecera ya trae la flecha de volver.
 */
@Injectable({ providedIn: 'root' })
export class ModoInmersivoService {
  private readonly _activo = signal(false);

  /** `true` mientras una vista pide la pantalla completa. */
  readonly activo = this._activo.asReadonly();

  activar(): void {
    this._activo.set(true);
  }

  desactivar(): void {
    this._activo.set(false);
  }
}
