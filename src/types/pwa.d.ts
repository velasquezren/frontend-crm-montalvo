/**
 * Tipado del evento `beforeinstallprompt` (instalación PWA).
 * No forma parte de lib.dom.d.ts porque aún es una propuesta no estandarizada,
 * así que se declara aquí en vez de usar `any`.
 * Ref: https://developer.mozilla.org/docs/Web/API/BeforeInstallPromptEvent
 */
interface BeforeInstallPromptEvent extends Event {
  readonly platforms: readonly string[];
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}

interface WindowEventMap {
  beforeinstallprompt: BeforeInstallPromptEvent;
  appinstalled: Event;
}

interface Window {
  /**
   * Sello del build que está sirviendo esta pestaña, puesto por
   * `PwaUpdateService`. Existe para poder abrir DevTools en la PC de una agente
   * y responder "este navegador ejecuta <sha>" sin deducirlo del comportamiento.
   * Se declara estructuralmente para que este archivo siga siendo global.
   */
  crmBuild?: { readonly sha: string; readonly compiladoEn: string };
}
