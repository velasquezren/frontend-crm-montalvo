import { MensajeApi } from './conversacion.model';

/**
 * El último mensaje en una línea de texto plano, como lo resume WhatsApp: la
 * lista de chats y la notificación del escritorio dicen lo mismo.
 *
 * Quita el formato (`*negrita*`, `_cursiva_`, `~tachado~`, `` `código` ``)
 * en vez de enseñar los asteriscos, y nombra la media por su tipo. Sin
 * emojis: en esta interfaz la simbología la ponen los íconos del catálogo.
 */
export function textoVistaPrevia(mensaje: Pick<MensajeApi, 'tipo' | 'contenido' | 'mediaNombre'> | undefined): string {
  if (!mensaje) return '';
  const texto = sinFormato(mensaje.contenido ?? '');
  switch (mensaje.tipo) {
    case 'IMAGEN':
      return texto ? `Foto · ${texto}` : 'Foto';
    case 'STICKER':
      return 'Sticker';
    case 'VIDEO':
      return texto ? `Video · ${texto}` : 'Video';
    case 'AUDIO':
      return 'Mensaje de voz';
    case 'DOCUMENTO':
      return mensaje.mediaNombre || texto || 'Documento';
    default:
      return texto;
  }
}

/** El texto sin marcas de formato de WhatsApp y en una sola línea. */
export function sinFormato(texto: string): string {
  return texto
    .replace(/```([\s\S]*?)```/g, '$1')
    .replace(/`([^`\n]+)`/g, '$1')
    .replace(/\*\*([^*\n]+)\*\*/g, '$1')
    .replace(/(^|[^\w*])\*([^*\n]+)\*(?=[^\w*]|$)/g, '$1$2')
    .replace(/(^|[^\w_])_([^_\n]+)_(?=[^\w_]|$)/g, '$1$2')
    .replace(/(^|[^\w~])~([^~\n]+)~(?=[^\w~]|$)/g, '$1$2')
    .replace(/\s+/g, ' ')
    .trim();
}
