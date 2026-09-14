/**
 * Anuncio de Meta por el que entró una paciente (Click-to-WhatsApp).
 *
 * El backend lo guarda en `Cliente.datosExtra.campanaOrigen` desde el `referral`
 * del webhook. **Todos los campos son opcionales, y no por comodidad:**
 *
 * - Meta manda unos u otros según el anuncio: `image_url` solo en los de imagen,
 *   `thumbnail_url` solo en los de video, y nunca `ctwa_clid` en los de Estados.
 * - Los chats anteriores al 14-09-2026 guardaron solo cuatro campos, porque el
 *   resto se descartaba al mapear el webhook.
 *
 * Por eso se lee campo a campo y nada se da por presente.
 */
export interface CampanaOrigen {
  titular?: string;
  anuncioId?: string;
  cuerpo?: string;
  origenUrl?: string;
  /** Imagen del anuncio, o su miniatura si era un anuncio de video. */
  imagenUrl?: string;
  /** `image` | `video`. */
  mediaTipo?: string;
  /** Saludo que el anuncio dejó escrito — suele ser el primer mensaje que envió. */
  saludo?: string;
}

/**
 * Lee la campaña de un `datosExtra`, o `null` si no entró por un anuncio.
 *
 * **Vivía duplicada** en el hilo y en el panel lateral de Conversaciones, y las
 * dos copias ya habían divergido: una leía siete campos y la otra cuatro, así
 * que el mismo chat mostraba distinto contexto según dónde lo mirases. Una sola
 * definición, probada, y las dos vistas la comparten.
 */
export function campanaOrigenDe(datosExtra: Record<string, unknown> | null | undefined): CampanaOrigen | null {
  const raw = datosExtra?.['campanaOrigen'];
  if (!raw || typeof raw !== 'object') return null;

  const c = raw as Record<string, unknown>;
  const texto = (clave: string): string | undefined =>
    typeof c[clave] === 'string' && c[clave] !== '' ? (c[clave] as string) : undefined;

  const campana: CampanaOrigen = {
    titular: texto('titular'),
    anuncioId: texto('anuncioId'),
    cuerpo: texto('cuerpo'),
    origenUrl: texto('origenUrl'),
    imagenUrl: texto('imagenUrl'),
    mediaTipo: texto('mediaTipo'),
    saludo: texto('saludo'),
  };

  /* Sin titular ni id no hay nada que enseñar: un `campanaOrigen` con solo
     `fecha` —que los hay— no debe pintar el banner. */
  return campana.titular || campana.anuncioId ? campana : null;
}
