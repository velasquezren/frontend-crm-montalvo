import { Component, DestroyRef, inject } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { SwUpdate, VersionEvent, VersionReadyEvent } from '@angular/service-worker';
import { Subject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { APP_BUILD } from '../build/app-build';
import { ToastService } from '../toast/toast.service';
import { ActualizacionDisponibleComponent } from './actualizacion-disponible.component';
import { PwaUpdateService } from './pwa-update.service';

/**
 * El rollout de una versión nueva, que el 2026-09-17 se demostró que NO es lo
 * mismo que el despliegue.
 *
 * Vercel ya servía R2.1 y el navegador de la agente seguía mandando mensajes
 * sin `clientMessageId` porque la PWA ejecutaba el bundle anterior. Dos causas:
 * el único disparo de búsqueda era un timer de 30 minutos, y el único aviso era
 * un toast que se puede cerrar y que se pierde entre otros.
 *
 * Lo que fijan estas pruebas: que volver a la app busque actualización sin
 * multiplicar peticiones, que el aviso no se pueda perder, y —igual de
 * importante— que nada recargue la aplicación por su cuenta. Una recarga
 * espontánea se llevaría por delante un borrador, un adjunto preparado o un
 * envío en vuelo.
 */

const THROTTLE_MS = 5 * 60 * 1000;
const TIMER_MS = 30 * 60 * 1000;

class SwUpdateFalso {
  isEnabled = true;
  readonly versionUpdates = new Subject<VersionEvent>();
  chequeos = 0;
  activaciones = 0;

  checkForUpdate(): Promise<boolean> {
    this.chequeos += 1;
    return Promise.resolve(false);
  }

  activateUpdate(): Promise<boolean> {
    this.activaciones += 1;
    return Promise.resolve(true);
  }

  /** Lo que emite el service worker cuando ya descargó la versión nueva. */
  anunciarVersionLista(): void {
    this.versionUpdates.next({
      type: 'VERSION_READY',
      currentVersion: { hash: 'viejo' },
      latestVersion: { hash: 'nuevo' },
    } as VersionReadyEvent);
  }
}

@Component({
  selector: 'app-anfitrion',
  imports: [ActualizacionDisponibleComponent],
  template: '<app-actualizacion-disponible />',
})
class AnfitrionComponent {}

describe('PwaUpdateService · rollout de versiones', () => {
  let sw: SwUpdateFalso;
  let servicio: PwaUpdateService;
  let recargar: ReturnType<typeof vi.fn>;
  let infoConsola: ReturnType<typeof vi.spyOn>;
  let visibilidad: DocumentVisibilityState;

  /** Arranca el servicio como lo hace `App`, con un DestroyRef real. */
  function arrancar(): void {
    TestBed.runInInjectionContext(() => servicio.inicializar(inject(DestroyRef)));
  }

  beforeEach(() => {
    vi.useFakeTimers();
    sw = new SwUpdateFalso();
    visibilidad = 'visible';

    /* jsdom no navega: sin esto, `aplicarActualizacion` escupe un error de
       "Not implemented: navigation" y no podríamos comprobar que NADIE recarga
       por su cuenta, que es la mitad del valor de este archivo. */
    recargar = vi.fn();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, reload: recargar },
    });
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => visibilidad,
    });
    infoConsola = vi.spyOn(console, 'info').mockImplementation(() => {});

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [{ provide: SwUpdate, useValue: sw }],
    });
    servicio = TestBed.inject(PwaUpdateService);
  });

  afterEach(() => {
    vi.useRealTimers();
    infoConsola.mockRestore();
  });

  /* ── 1-2. Lo que ya existía sigue existiendo ─────────────────────────── */

  it('1 · busca actualización al arrancar', () => {
    arrancar();
    expect(sw.chequeos).toBe(1);
  });

  it('2 · el timer de 30 minutos sigue funcionando', () => {
    arrancar();
    expect(sw.chequeos).toBe(1);

    vi.advanceTimersByTime(TIMER_MS);
    expect(sw.chequeos).toBe(2);

    vi.advanceTimersByTime(TIMER_MS);
    expect(sw.chequeos).toBe(3);
  });

  /* ── 3-7. Volver a la app, sin multiplicar peticiones ────────────────── */

  it('3 · el foco busca actualización una vez pasado el throttle', () => {
    arrancar();
    vi.advanceTimersByTime(THROTTLE_MS);

    window.dispatchEvent(new Event('focus'));
    expect(sw.chequeos).toBe(2);
  });

  it('4 · el foco NO busca nada dentro de la ventana de throttle', () => {
    arrancar();
    vi.advanceTimersByTime(THROTTLE_MS - 1000);

    window.dispatchEvent(new Event('focus'));
    expect(sw.chequeos).toBe(1);
  });

  it('5 · volver a visible busca actualización', () => {
    arrancar();
    vi.advanceTimersByTime(THROTTLE_MS);

    document.dispatchEvent(new Event('visibilitychange'));
    expect(sw.chequeos).toBe(2);
  });

  it('6 · foco y visibilidad juntos producen UN solo chequeo', () => {
    arrancar();
    vi.advanceTimersByTime(THROTTLE_MS);

    /* Es lo que pasa de verdad al volver a la pestaña: el navegador dispara los
       dos eventos casi a la vez. Sin throttle serían dos descargas de
       `ngsw.json` por un gesto. */
    window.dispatchEvent(new Event('focus'));
    document.dispatchEvent(new Event('visibilitychange'));
    expect(sw.chequeos).toBe(2);
  });

  it('7 · pasar a oculto no busca nada', () => {
    arrancar();
    vi.advanceTimersByTime(THROTTLE_MS);

    visibilidad = 'hidden';
    document.dispatchEvent(new Event('visibilitychange'));
    expect(sw.chequeos).toBe(1);
  });

  /* ── 8-9. El aviso no se puede perder ────────────────────────────────── */

  it('8 · VERSION_READY marca la actualización como pendiente', () => {
    arrancar();
    expect(servicio.actualizacionPendiente()).toBe(false);

    sw.anunciarVersionLista();
    expect(servicio.actualizacionPendiente()).toBe(true);
  });

  it('9 · cerrar el toast no se lleva el indicador', () => {
    arrancar();
    const toast = TestBed.inject(ToastService);
    sw.anunciarVersionLista();

    const fixture = TestBed.createComponent(AnfitrionComponent);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('button')).not.toBeNull();
    expect(toast.toasts().length).toBe(1);

    /* La agente cierra el aviso — es justo lo que hace que el toast no baste. */
    toast.dismiss(toast.toasts()[0].id);
    fixture.detectChanges();

    expect(toast.toasts().length).toBe(0);
    expect(servicio.actualizacionPendiente()).toBe(true);
    expect(fixture.nativeElement.querySelector('button')).not.toBeNull();
  });

  /* ── 10-11. Actualizar es una decisión de la agente ──────────────────── */

  it('10 · el botón de la cabecera aplica la actualización y recarga', async () => {
    arrancar();
    sw.anunciarVersionLista();

    const fixture = TestBed.createComponent(AnfitrionComponent);
    fixture.detectChanges();
    fixture.nativeElement.querySelector('button').click();
    await vi.waitFor(() => expect(sw.activaciones).toBe(1));

    expect(recargar).toHaveBeenCalledTimes(1);
  });

  it('11 · nada recarga solo: sin clic no hay activateUpdate ni reload', () => {
    arrancar();
    sw.anunciarVersionLista();

    /* Aunque pase el día entero con el aviso en pantalla. Recargar por nuestra
       cuenta destruiría el borrador, el adjunto preparado y los globos
       `ENVIANDO` que todavía no llegaron al servidor. */
    vi.advanceTimersByTime(24 * 60 * 60 * 1000);

    expect(sw.activaciones).toBe(0);
    expect(recargar).not.toHaveBeenCalled();
  });

  /* ── 12. Saber qué build corre este navegador ────────────────────────── */

  it('12 · sella el build en consola y en window, sin inventarse el valor', () => {
    arrancar();

    expect(APP_BUILD.sha).toMatch(/^[0-9a-f]{7}$|^desconocido$/);
    expect(Date.parse(APP_BUILD.compiladoEn)).not.toBeNaN();
    expect(window.crmBuild).toEqual(APP_BUILD);
    expect(infoConsola).toHaveBeenCalledTimes(1);
    expect(String(infoConsola.mock.calls[0][0])).toContain(APP_BUILD.sha);
  });

  it('12b · el sello se pone aunque el service worker esté deshabilitado', () => {
    sw.isEnabled = false;
    arrancar();

    expect(window.crmBuild).toEqual(APP_BUILD);
    expect(sw.chequeos).toBe(0);
  });
});
