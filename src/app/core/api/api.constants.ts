/**
 * URL base del backend NestJS, resuelta en tiempo de ejecución.
 *
 * Se decide por el hostname del navegador en vez de por configuración de build:
 * así el mismo bundle sirve para desarrollo y para Vercel, sin fileReplacements
 * ni variables de entorno en el pipeline.
 *
 * Producción usa HTTPS obligatoriamente: un frontend servido por HTTPS no puede
 * llamar a un API por HTTP (el navegador bloquea el contenido mixto).
 */
const HOSTS_LOCALES = ['localhost', '127.0.0.1', '[::1]'];

function resolverApiUrl(): string {
  /* Fuera del navegador (SSR/prerender) no hay window: se asume producción. */
  if (typeof window === 'undefined') {
    return 'https://crm.107.175.132.15.nip.io';
  }
  return HOSTS_LOCALES.includes(window.location.hostname)
    ? 'http://localhost:3001'
    : 'https://crm.107.175.132.15.nip.io';
}

export const API_URL = resolverApiUrl();

/**
 * Una URL que devuelve la API para mostrarla (la foto de un médico): si viene
 * relativa (`/publico/…`, un backend sin `CRM_URL_PUBLICA`), se completa con la
 * base de la API; absoluta o vacía, tal cual.
 */
export function urlDeLaApi(url: string | null | undefined): string | null {
  if (!url) return null;
  return url.startsWith('/') && !url.startsWith('//') ? `${API_URL}${url}` : url;
}
