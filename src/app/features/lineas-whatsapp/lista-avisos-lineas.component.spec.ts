import '@angular/compiler';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { AvisoLinea } from './linea-whatsapp.model';
import { ListaAvisosLineasComponent } from './lista-avisos-lineas.component';

/**
 * El renglón compartido por Perfil y Agentes. Presentacional: lo único que
 * decide es qué emite y qué bloquea; guardar es cosa de quien lo usa.
 */

const RECEPCION: AvisoLinea = { lineaId: 'l-recepcion', nombre: 'Recepción', telefono: '+59175031306', suena: false };
const VENTAS: AvisoLinea = { lineaId: 'l-ventas', nombre: 'Ventas', telefono: null, suena: true };

describe('ListaAvisosLineasComponent', () => {
  let fixture: ComponentFixture<ListaAvisosLineasComponent>;
  let emitidos: Array<{ lineaId: string; suena: boolean }>;

  function montar(enEspera: string[] = []): HTMLButtonElement[] {
    fixture = TestBed.createComponent(ListaAvisosLineasComponent);
    fixture.componentRef.setInput('avisos', [RECEPCION, VENTAS]);
    fixture.componentRef.setInput('enEspera', enEspera);
    fixture.componentInstance.cambio.subscribe(c => emitidos.push(c));
    fixture.detectChanges();
    return [...fixture.nativeElement.querySelectorAll('[role="switch"]')] as HTMLButtonElement[];
  }

  beforeEach(() => {
    TestBed.resetTestingModule();
    emitidos = [];
  });

  afterEach(() => fixture?.destroy());

  it('pinta el estado de cada línea y su teléfono si lo tiene', () => {
    const [recepcion, ventas] = montar();
    expect(recepcion.getAttribute('aria-checked')).toBe('false');
    expect(ventas.getAttribute('aria-checked')).toBe('true');
    expect(recepcion.getAttribute('aria-label')).toBe('Avisos de Recepción');
    expect(fixture.nativeElement.textContent).toContain('+59175031306');
  });

  it('al tocar un interruptor emite la línea y el estado NUEVO', () => {
    const [recepcion] = montar();
    recepcion.click();
    expect(emitidos).toEqual([{ lineaId: 'l-recepcion', suena: true }]);
  });

  it('una línea en espera no se puede tocar', () => {
    const [recepcion, ventas] = montar(['l-recepcion']);
    expect(recepcion.disabled).toBe(true);
    expect(ventas.disabled).toBe(false);
    recepcion.click();
    expect(emitidos).toEqual([]);
  });
});
