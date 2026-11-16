import '@angular/compiler';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it } from 'vitest';

import { KpiResumen } from '../../kpis.model';
import { DashVentasComponent } from './dash-ventas.component';

const dia = (fecha: string, ventas: number) => ({ fecha, captados: 0, respondidos: 0, medianaMinutos: null, ventas });

function resumen(serie: ReturnType<typeof dia>[], total: number, cantidad: number): KpiResumen {
  return {
    periodo: { clave: 'MES', desde: '2026-11-01T04:00:00Z', hasta: '2026-11-04T04:00:00Z', granularidad: 'DIA' },
    serie,
    ventas: { total, cantidad, ticketPromedio: cantidad ? Math.round(total / cantidad) : 0, anterior: { total: 0, cantidad: 0 }, porAgente: [] },
  } as unknown as KpiResumen;
}

/**
 * Ocupa el sitio de «Leads por día» (16/11/2026). Lo que importa: la línea
 * suma, el tope es redondo, y sin ventas dice que no hay en vez de una recta
 * en cero.
 */
describe('ventas acumuladas del Dashboard', () => {
  let fixture: ComponentFixture<DashVentasComponent>;
  afterEach(() => fixture?.destroy());

  function montar(r: KpiResumen) {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    fixture = TestBed.createComponent(DashVentasComponent);
    fixture.componentRef.setInput('resumen', r);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('suma día a día, con el tope redondo y el mejor día', () => {
    const raiz = montar(resumen([dia('2026-11-01', 1000), dia('2026-11-02', 0), dia('2026-11-03', 7000)], 8000, 3));
    const texto = raiz.textContent ?? '';
    expect(texto).toContain('3 ventas');
    expect(texto).toContain('Bs 10 mil');
    expect(texto).toMatch(/Mejor día: 3 nov\.?, Bs 7\.000,00/);
    /* 1000, 1000, 8000 sobre un tope de 10 000: la línea termina al 20 % del alto. */
    expect(raiz.querySelector('.ven-linea')?.getAttribute('d')).toBe('M0.00,90.00 L50.00,90.00 L100.00,20.00');
  });

  it('sin ventas no dibuja una recta en cero', () => {
    const raiz = montar(resumen([dia('2026-11-01', 0), dia('2026-11-02', 0)], 0, 0));
    expect(raiz.querySelector('.ven-linea')).toBeNull();
    expect(raiz.textContent).toContain('Sin ventas en este periodo');
  });

  it('el primer día del mes es una recta, no un punto suelto', () => {
    const raiz = montar(resumen([dia('2026-11-01', 400)], 400, 1));
    expect(raiz.querySelector('.ven-linea')?.getAttribute('d')).toBe('M0.00,20.00 L100.00,20.00');
  });
});
