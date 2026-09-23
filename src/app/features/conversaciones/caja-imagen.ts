import { Pipe, PipeTransform } from '@angular/core';

/** Lo más que ocupa una foto en la burbuja. */
const MAX_ANCHO = 260;
const MAX_ALTO = 288;
/** Ni una tira finísima ni un sello: por debajo de esto no se lee. */
const MIN_LADO = 96;
/** Sin medidas (fotos anteriores al 2026-09-23): cuadrada, recortada al centro. */
const SIN_MEDIDAS = { ancho: 240, alto: 240, recortar: true } as const;

export interface CajaImagen {
  readonly ancho: number;
  readonly alto: number;
  /** true = la foto se recorta al centro (no se conoce su proporción). */
  readonly recortar: boolean;
}

/**
 * La caja que ocupa una foto en el chat, calculada ANTES de que llegue.
 *
 * Sin ella cada burbuja nacía con altura 0 y crecía al cargar la imagen: en
 * un chat con muchas fotos el hilo se reacomodaba una vez por foto, y el
 * ajuste que baja al último mensaje perseguía esos saltos. Era el parpadeo al
 * entrar. Con medidas (el backend las guarda desde el 2026-09-23) la caja es
 * la exacta; sin ellas, una fija. En los dos casos, nada salta.
 */
export function cajaImagen(ancho: number | null | undefined, alto: number | null | undefined): CajaImagen {
  if (!ancho || !alto || ancho <= 0 || alto <= 0) return SIN_MEDIDAS;
  const escala = Math.min(MAX_ANCHO / ancho, MAX_ALTO / alto, 1);
  return {
    ancho: Math.max(Math.round(ancho * escala), MIN_LADO),
    alto: Math.max(Math.round(alto * escala), MIN_LADO),
    recortar: false,
  };
}

/** Pura: en un hilo de 50 mensajes no se recalcula en cada ciclo. */
@Pipe({ name: 'cajaImagen' })
export class CajaImagenPipe implements PipeTransform {
  transform(mensaje: { readonly mediaAncho?: number | null; readonly mediaAlto?: number | null }): CajaImagen {
    return cajaImagen(mensaje.mediaAncho, mensaje.mediaAlto);
  }
}
