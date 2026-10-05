import '@angular/compiler';
import { Component, inject, TemplateRef, viewChild, ViewContainerRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DialogService } from './dialog.service';

@Component({ template: '<ng-template #contenido><p class="contenido-cajon">Formulario</p></ng-template>' })
class Anfitrion {
  readonly contenido = viewChild.required<TemplateRef<unknown>>('contenido');
  readonly vcr = inject(ViewContainerRef);
}

/** Escape y el clic fuera preguntan antes de cerrar: un formulario con cambios no se pierde por un descuido. */
describe('DialogService · puedeCerrar', () => {
  afterEach(() => TestBed.resetTestingModule());

  function abrir(puedeCerrar?: () => boolean) {
    const fixture = TestBed.createComponent(Anfitrion);
    fixture.detectChanges();
    const onClose = vi.fn();
    const ref = TestBed.inject(DialogService).abrirCajon(fixture.componentInstance.contenido(), fixture.componentInstance.vcr, { onClose, puedeCerrar });
    const escape = () => document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    return { ref, onClose, escape, abierto: () => !!document.querySelector('.contenido-cajon') };
  }

  it('sin guarda, Escape cierra', () => {
    const { onClose, escape, abierto } = abrir();
    escape();
    expect(onClose).toHaveBeenCalled();
    expect(abierto()).toBe(false);
  });

  it('si la guarda dice que no, sigue abierto; si dice que sí, cierra', () => {
    let permitir = false;
    const { ref, onClose, escape, abierto } = abrir(() => permitir);
    escape();
    expect(onClose).not.toHaveBeenCalled();
    expect(abierto()).toBe(true);
    permitir = true;
    escape();
    expect(onClose).toHaveBeenCalled();
    expect(abierto()).toBe(false);
    ref.dispose();
  });
});
