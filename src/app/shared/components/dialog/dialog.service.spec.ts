import '@angular/compiler';
import { Component, inject, TemplateRef, viewChild, ViewContainerRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DrawerComponent } from '../drawer/drawer.component';
import { DialogService } from './dialog.service';

@Component({ template: `<ng-template #contenido><p class="contenido-cajon">Formulario</p>
  <input class="campo" /><input class="buscador" type="search" /></ng-template>` })
class Anfitrion {
  readonly contenido = viewChild.required<TemplateRef<unknown>>('contenido');
  readonly vcr = inject(ViewContainerRef);
}

/** Escape y el clic fuera preguntan antes de cerrar: un formulario con cambios no se pierde por un descuido. */
describe('DialogService · puedeCerrar', () => {
  afterEach(() => TestBed.resetTestingModule());

  function abrir(puedeCerrar?: () => boolean, confirmarDescarte = false) {
    const fixture = TestBed.createComponent(Anfitrion);
    fixture.detectChanges();
    const onClose = vi.fn();
    const ref = TestBed.inject(DialogService).abrirCajon(fixture.componentInstance.contenido(), fixture.componentInstance.vcr, { onClose, puedeCerrar, confirmarDescarte });
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

  describe('confirmarDescarte', () => {
    const escribir = (selector: string) =>
      document.querySelector(selector)?.dispatchEvent(new Event('input', { bubbles: true }));

    afterEach(() => vi.restoreAllMocks());

    it('sin escribir nada, cierra sin preguntar', () => {
      const confirmar = vi.spyOn(window, 'confirm');
      const { escape, abierto } = abrir(undefined, true);
      escape();
      expect(confirmar).not.toHaveBeenCalled();
      expect(abierto()).toBe(false);
    });

    it('con algo escrito pregunta; si no se confirma, sigue abierto', () => {
      const confirmar = vi.spyOn(window, 'confirm').mockReturnValue(false);
      const { ref, onClose, escape, abierto } = abrir(undefined, true);
      escribir('.campo');
      escape();
      expect(confirmar).toHaveBeenCalledOnce();
      expect(onClose).not.toHaveBeenCalled();
      expect(abierto()).toBe(true);

      confirmar.mockReturnValue(true);
      escape();
      expect(abierto()).toBe(false);
      ref.dispose();
    });

    it('escribir en un buscador no cuenta como cambio', () => {
      const confirmar = vi.spyOn(window, 'confirm');
      const { escape, abierto } = abrir(undefined, true);
      escribir('.buscador');
      escape();
      expect(confirmar).not.toHaveBeenCalled();
      expect(abierto()).toBe(false);
    });

    it('sin la opción, escribir no cambia nada', () => {
      const confirmar = vi.spyOn(window, 'confirm');
      const { escape, abierto } = abrir();
      escribir('.campo');
      escape();
      expect(confirmar).not.toHaveBeenCalled();
      expect(abierto()).toBe(false);
    });
  });
});

/* Un componente cuya raíz es <app-drawer> (la ficha del médico) queda entre el
   panel y el <aside>. Como hijo flex no encogía por debajo de su contenido más
   ancho, y en un teléfono el cajón se cortaba por la izquierda. `styles.css` lo
   saca del layout con este selector; las pruebas no cargan la hoja global, así
   que aquí se fija A QUIÉN elige, y `check:skills` exige que siga en la hoja. */
const ENVOLTORIO_DE_CAJON = '.crm-panel-cajon > :not(app-drawer):has(> app-drawer)';

@Component({ selector: 'ficha-doble', imports: [DrawerComponent], template: '<app-drawer etiqueta="Ficha"><p>Ficha</p></app-drawer>' })
class FichaDoble {}

@Component({ imports: [FichaDoble, DrawerComponent], template: '<ng-template #ficha><ficha-doble /></ng-template><ng-template #directo><app-drawer etiqueta="Directo" /></ng-template>' })
class AnfitrionDeFicha {
  readonly ficha = viewChild.required<TemplateRef<unknown>>('ficha');
  readonly directo = viewChild.required<TemplateRef<unknown>>('directo');
  readonly vcr = inject(ViewContainerRef);
}

describe('DialogService · cajón envuelto en un componente', () => {
  afterEach(() => TestBed.resetTestingModule());

  function abrir(cual: 'ficha' | 'directo') {
    const fixture = TestBed.createComponent(AnfitrionDeFicha);
    fixture.detectChanges();
    const ref = TestBed.inject(DialogService).abrirCajon(fixture.componentInstance[cual](), fixture.componentInstance.vcr);
    fixture.detectChanges();
    return ref;
  }

  it('el selector de styles.css elige la etiqueta que envuelve al cajón', () => {
    const ref = abrir('ficha');
    expect(document.querySelectorAll(ENVOLTORIO_DE_CAJON)).toHaveLength(1);
    expect(document.querySelector(ENVOLTORIO_DE_CAJON)?.tagName).toBe('FICHA-DOBLE');
    ref.dispose();
  });

  it('un <app-drawer> directo no lo necesita y el selector no lo toca', () => {
    const ref = abrir('directo');
    expect(document.querySelector('.crm-panel-cajon > app-drawer')).not.toBeNull();
    expect(document.querySelector(ENVOLTORIO_DE_CAJON)).toBeNull();
    ref.dispose();
  });
});
