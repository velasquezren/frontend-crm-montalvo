import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { MonedaService } from '../../core/moneda/moneda.service';
import { MonedaPipe } from './moneda.pipe';

/*
 * El pipe memoriza su último resultado para no reformatear en cada ciclo de
 * detección de cambios. Un memo demasiado agresivo no da error: deja el importe
 * anterior en pantalla, y eso es una cifra de dinero equivocada delante de
 * administración. Estas pruebas fijan las cinco cosas que TIENEN que invalidarlo.
 */
describe('MonedaPipe', () => {
  function montar() {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [MonedaService, MonedaPipe] });
    const servicio = TestBed.inject(MonedaService);
    servicio.setMoneda('BOB');
    servicio.setTipoCambio(6.97);
    return { servicio, pipe: TestBed.inject(MonedaPipe) };
  }

  it('formatea en bolivianos un importe que ya viene en bolivianos', () => {
    const { pipe } = montar();
    expect(pipe.transform(1234.5, 'BOB')).toBe('Bs 1.234,50');
  });

  it('convierte a bolivianos un importe que viene en dólares', () => {
    const { pipe } = montar();
    expect(pipe.transform(100, 'USD')).toBe('Bs 697,00');
  });

  it('repetir la misma llamada devuelve exactamente lo mismo', () => {
    const { pipe } = montar();
    const uno = pipe.transform(1234.5, 'BOB');
    expect(pipe.transform(1234.5, 'BOB')).toBe(uno);
  });

  it('al cambiar de moneda el memo se invalida', () => {
    const { servicio, pipe } = montar();
    expect(pipe.transform(697, 'BOB')).toBe('Bs 697,00');

    servicio.setMoneda('USD');
    expect(pipe.transform(697, 'BOB')).toBe('$us 100,00');
  });

  it('al cambiar el tipo de cambio el memo se invalida', () => {
    const { servicio, pipe } = montar();
    servicio.setMoneda('USD');
    expect(pipe.transform(697, 'BOB')).toBe('$us 100,00');

    servicio.setTipoCambio(7);
    expect(pipe.transform(697, 'BOB')).toBe('$us 99,57');
  });

  it('al cambiar el importe el memo se invalida', () => {
    const { pipe } = montar();
    expect(pipe.transform(100, 'BOB')).toBe('Bs 100,00');
    expect(pipe.transform(200, 'BOB')).toBe('Bs 200,00');
  });

  it('al cambiar el origen el memo se invalida', () => {
    const { pipe } = montar();
    expect(pipe.transform(100, 'BOB')).toBe('Bs 100,00');
    expect(pipe.transform(100, 'USD')).toBe('Bs 697,00');
  });

  /* El TC por argumento gana sobre el vigente: es como la planilla liquida un
     mes con el tipo de cambio de ESE mes. */
  it('al cambiar el tipo de cambio pasado por argumento el memo se invalida', () => {
    const { servicio, pipe } = montar();
    servicio.setMoneda('USD');
    expect(pipe.transform(700, 'BOB', 7)).toBe('$us 100,00');
    expect(pipe.transform(700, 'BOB', 6.97)).toBe('$us 100,43');
  });

  it('un importe nulo no imprime nada', () => {
    const { pipe } = montar();
    expect(pipe.transform(null)).toBe('');
    expect(pipe.transform(undefined)).toBe('');
  });

  /* La API manda los decimales como texto: "1234.50", no 1234.5. */
  it('acepta el importe como cadena, que es como llega de la API', () => {
    const { pipe } = montar();
    expect(pipe.transform('1234.50', 'BOB')).toBe('Bs 1.234,50');
  });
});
