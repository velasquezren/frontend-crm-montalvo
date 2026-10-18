import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { DireccionOrden, ThOrdenableComponent } from './th-ordenable.component';
import { InfoHintComponent } from '../info-hint/info-hint.component';

@Component({
  imports: [ThOrdenableComponent, InfoHintComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<table><thead><tr>
    <th appOrdenable="importe" [orden]="orden()" [direccion]="direccion()" direccionInicial="desc"
        (ordenar)="orden.set($event.orden); direccion.set($event.direccion)">Importe
      <app-info-hint titulo="Importe"><p>Importe registrado.</p></app-info-hint>
    </th>
  </tr></thead></table>`,
})
class TablaPrueba {
  readonly orden = signal<string | undefined>(undefined);
  readonly direccion = signal<DireccionOrden>('asc');
}

describe('cabecera ordenable', () => {
  it('conserva la cabecera de columna y emite el mismo orden mediante un botón nativo', () => {
    const fixture = TestBed.createComponent(TablaPrueba);
    fixture.detectChanges();
    const th: HTMLTableCellElement = fixture.nativeElement.querySelector('th');
    const boton: HTMLButtonElement = th.querySelector('button')!;
    expect(th.getAttribute('role')).toBeNull();
    expect(th.scope).toBe('col');
    expect(th.getAttribute('aria-sort')).toBe('none');
    expect(boton.type).toBe('button');
    expect(boton.textContent).toContain('Importe');
    expect(boton.querySelector('app-info-hint')).toBeNull();
    const ayuda = th.querySelector<HTMLButtonElement>('app-info-hint button')!;
    ayuda.click();
    fixture.detectChanges();
    expect(fixture.componentInstance.orden()).toBeUndefined();
    expect(ayuda.getAttribute('aria-expanded')).toBe('true');
    expect(document.getElementById(ayuda.getAttribute('aria-describedby')!)?.textContent).toContain('Importe registrado.');
    ayuda.click();
    boton.click();
    fixture.detectChanges();
    expect(fixture.componentInstance.orden()).toBe('importe');
    expect(th.getAttribute('aria-sort')).toBe('descending');
    boton.click();
    fixture.detectChanges();
    expect(th.getAttribute('aria-sort')).toBe('ascending');
    fixture.destroy();
  });
});
