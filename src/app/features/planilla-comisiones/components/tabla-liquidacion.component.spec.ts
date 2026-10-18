import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { TablaLiquidacionComponent } from './tabla-liquidacion.component';

describe('controles de la tabla de liquidación', () => {
  it('ordena con el mismo criterio al activar una cabecera y no ordena al abrir su ayuda', () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    const fixture = TestBed.createComponent(TablaLiquidacionComponent);
    fixture.componentRef.setInput('filas', []);
    fixture.componentRef.setInput('totales', {});
    fixture.detectChanges();
    const cabecera: HTMLTableCellElement = fixture.nativeElement.querySelector('th[appOrdenable="montoVendido"]');
    const ordenar = cabecera.querySelector<HTMLButtonElement>('.crm-th-orden-caja')!;
    expect(cabecera.getAttribute('aria-sort')).toBe('none');
    ordenar.click();
    fixture.detectChanges();
    expect(cabecera.getAttribute('aria-sort')).toBe('descending');
    ordenar.click();
    fixture.detectChanges();
    expect(cabecera.getAttribute('aria-sort')).toBe('ascending');
    cabecera.querySelector<HTMLButtonElement>('app-info-hint button')!.click();
    fixture.detectChanges();
    expect(cabecera.getAttribute('aria-sort')).toBe('ascending');
    expect(cabecera.querySelector('button button')).toBeNull();
    fixture.destroy();
  });
});
