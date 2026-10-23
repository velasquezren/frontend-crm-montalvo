import '@angular/compiler';
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it } from 'vitest';

import { ImageViewerComponent } from './image-viewer.component';

/** Como lo usan Reservas, Ventas y Perfil: el visor siempre montado y la URL a null al cerrarse. */
@Component({
  imports: [ImageViewerComponent],
  template: `<app-image-viewer [imageUrl]="url()" (closed)="url.set(null)" />`,
})
class Anfitrion {
  readonly url = signal<string | null>(null);
}

/**
 * Escape lo cierra el DialogService con su propio `dispose()`, sin pasar por
 * `cerrar()`: el visor se quedaba con el overlay muerto como «abierto», no
 * avisaba `closed` y ninguna otra foto se abría hasta recargar la página.
 */
describe('ImageViewerComponent · cerrar con Escape', () => {
  afterEach(() => TestBed.resetTestingModule());

  async function montar() {
    const fixture = TestBed.createComponent(Anfitrion);
    fixture.detectChanges();
    const abrir = async (url: string) => {
      fixture.componentInstance.url.set(url);
      fixture.detectChanges();
      await Promise.resolve();
      fixture.detectChanges();
    };
    const escape = () => {
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      fixture.detectChanges();
    };
    const visible = () => document.querySelector<HTMLImageElement>('img[alt="Vista previa de foto"]')?.getAttribute('src') ?? null;
    return { fixture, abrir, escape, visible };
  }

  it('avisa que se cerró y la siguiente foto se abre', async () => {
    const { fixture, abrir, escape, visible } = await montar();
    await abrir('https://r2.example/a.jpg');
    expect(visible()).toBe('https://r2.example/a.jpg');

    escape();
    expect(visible()).toBeNull();
    expect(fixture.componentInstance.url()).toBeNull();

    await abrir('https://r2.example/b.jpg');
    expect(visible()).toBe('https://r2.example/b.jpg');
  });

  it('la misma foto se puede volver a abrir', async () => {
    const { abrir, escape, visible } = await montar();
    await abrir('https://r2.example/a.jpg');
    escape();
    await abrir('https://r2.example/a.jpg');
    expect(visible()).toBe('https://r2.example/a.jpg');
  });

  it('el botón Cerrar avisa una sola vez', async () => {
    const { fixture, abrir, visible } = await montar();
    let avisos = 0;
    fixture.debugElement.children[0].componentInstance.closed.subscribe(() => avisos++);
    await abrir('https://r2.example/a.jpg');
    document.querySelector<HTMLButtonElement>('button[title="Cerrar (Esc)"]')!.click();
    fixture.detectChanges();
    expect(visible()).toBeNull();
    expect(avisos).toBe(1);
  });
});
