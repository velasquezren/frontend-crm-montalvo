import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { TablistDirective } from './tablist.directive';

@Component({
  imports: [TablistDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<nav appTablist role="tablist" aria-label="Secciones">
    @for (tab of ['a', 'b', 'c']; track tab) {
      <button type="button" role="tab" [disabled]="tab === 'b'" [attr.aria-selected]="activa() === tab"
        [tabIndex]="activa() === tab ? 0 : -1" (click)="activa.set(tab)">{{ tab }}</button>
    }
  </nav>`,
})
class PestanasPrueba {
  readonly activa = signal('a');
}

describe('teclado de pestañas', () => {
  it('recorre las disponibles, vuelve al extremo y deja una sola parada de Tab', () => {
    const fixture = TestBed.createComponent(PestanasPrueba);
    fixture.detectChanges();
    const botones = Array.from(fixture.nativeElement.querySelectorAll('button')) as HTMLButtonElement[];
    const tecla = (indice: number, key: string) => {
      const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
      botones[indice].dispatchEvent(event);
      fixture.detectChanges();
      return event.defaultPrevented;
    };
    expect(tecla(0, 'ArrowRight')).toBe(true);
    expect(fixture.componentInstance.activa()).toBe('c');
    expect(document.activeElement).toBe(botones[2]);
    expect(botones.filter(b => b.tabIndex === 0)).toEqual([botones[2]]);
    tecla(2, 'ArrowRight');
    expect(fixture.componentInstance.activa()).toBe('a');
    tecla(0, 'ArrowLeft');
    expect(fixture.componentInstance.activa()).toBe('c');
    tecla(2, 'Home');
    expect(fixture.componentInstance.activa()).toBe('a');
    tecla(0, 'End');
    expect(fixture.componentInstance.activa()).toBe('c');
    expect(tecla(2, 'ArrowDown')).toBe(false);
    fixture.destroy();
  });
});
