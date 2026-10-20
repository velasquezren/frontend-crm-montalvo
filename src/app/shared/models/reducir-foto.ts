/**
 * Achica una foto de cámara antes de subirla al chat.
 *
 * Medido en producción (20/10/2026): subir un adjunto tardaba 1,4 s de mediana,
 * 4 s el 5 % más lento y hasta 63 s, casi todo por la subida desde Bolivia. Una
 * foto de teléfono pesa 3-5 MB (4000×3000) y en el chat se ve en una burbuja;
 * a 2560 px de lado sigue siendo nítida y pesa 5-8 veces menos. De paso se va
 * el EXIF (la ubicación GPS del teléfono no tiene por qué llegarle a nadie).
 *
 * Solo JPEG: es lo que sale de la cámara. Una captura PNG con texto se
 * emborronaría en JPEG, y un PDF no se toca. Ante cualquier problema, o si no
 * gana nada, devuelve el archivo tal cual: achicar es una mejora, nunca un
 * motivo para no poder adjuntar.
 */
export const LADO_MAXIMO_FOTO = 2560;
const CALIDAD = 0.85;
/** Por debajo de esto, re-codificar cuesta más de lo que ahorra. */
const BYTES_MINIMOS = 700 * 1024;

/** El tamaño final, sin agrandar nunca. */
export function dimensionesReducidas(ancho: number, alto: number, maximo = LADO_MAXIMO_FOTO): { ancho: number; alto: number } {
  const escala = Math.min(1, maximo / Math.max(ancho, alto, 1));
  return { ancho: Math.max(1, Math.round(ancho * escala)), alto: Math.max(1, Math.round(alto * escala)) };
}

/** Si vale la pena intentarlo. Síncrono a propósito: lo demás no espera un turno de más. */
export function seReduce(archivo: Pick<File, 'type' | 'size'>): boolean {
  return archivo.type === 'image/jpeg' && archivo.size >= BYTES_MINIMOS && typeof createImageBitmap === 'function';
}

export async function reducirFoto(archivo: File): Promise<File> {
  if (!seReduce(archivo)) return archivo;
  let imagen: ImageBitmap | undefined;
  try {
    /* `from-image` aplica la rotación del EXIF: la foto vertical sale vertical. */
    imagen = await createImageBitmap(archivo, { imageOrientation: 'from-image' });
    const { ancho, alto } = dimensionesReducidas(imagen.width, imagen.height);
    const lienzo = document.createElement('canvas');
    lienzo.width = ancho;
    lienzo.height = alto;
    const ctx = lienzo.getContext('2d');
    if (!ctx) return archivo;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(imagen, 0, 0, ancho, alto);
    const blob = await new Promise<Blob | null>(resolve => lienzo.toBlob(resolve, 'image/jpeg', CALIDAD));
    if (!blob || blob.size >= archivo.size) return archivo;
    return new File([blob], archivo.name, { type: 'image/jpeg', lastModified: archivo.lastModified });
  } catch {
    return archivo;
  } finally {
    imagen?.close();
  }
}
