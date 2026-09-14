import '@angular/compiler';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ActividadesService } from './actividades.service';

/**
 * Lo que se fija aquí es el contrato que arregló la campana: **toda** mutación
 * de actividades sube `cambios`, venga de donde venga, y un fallo NO la sube.
 *
 * El bug que lo motivó: la campana del layout y la página de Actividades tenían
 * cada una su `httpResource` del mismo `/actividades/resumen`, y solo quien
 * mutaba recargaba lo suyo. Completar una actividad desde la página dejaba el
 * badge con el número viejo hasta el respaldo de 60 s. Si alguien añade un
 * método de mutación y se olvida del `tras()`, la primera prueba de abajo
 * —que recorre la lista entera— es la que lo atrapa.
 */
let servicio: ActividadesService;
let pruebas: HttpTestingController;

beforeEach(() => {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting()],
  });
  servicio = TestBed.inject(ActividadesService);
  pruebas = TestBed.inject(HttpTestingController);
});
afterEach(() => pruebas.verify());

/** Cada mutación pública del servicio, con la forma de su petición. */
const MUTACIONES: Array<[string, (s: ActividadesService) => Promise<unknown>, string]> = [
  ['crear', s => s.crear({ tipo: 'LLAMADA', titulo: 'x', fechaProgramada: '2026-01-01T10:00:00Z', clienteId: 'c1' }), 'POST'],
  ['actualizar', s => s.actualizar('a1', { titulo: 'y' }), 'PATCH'],
  ['actualizarEstado', s => s.actualizarEstado('a1', 'COMPLETADA'), 'PATCH'],
  ['eliminar', s => s.eliminar('a1'), 'DELETE'],
];

describe('ActividadesService · `cambios` invalida a TODOS los que pintan actividades', () => {
  it.each(MUTACIONES)('%s sube el contador al terminar bien', async (_n, ejecutar, metodo) => {
    const antes = servicio.cambios();

    const pendiente = ejecutar(servicio);
    pruebas.expectOne(r => r.method === metodo).flush({ id: 'a1' });
    await pendiente;

    expect(servicio.cambios()).toBe(antes + 1);
  });

  it.each(MUTACIONES)('%s NO sube el contador si la petición falla', async (_n, ejecutar, metodo) => {
    const antes = servicio.cambios();

    const pendiente = ejecutar(servicio).catch(() => 'falló');
    pruebas.expectOne(r => r.method === metodo).flush(null, { status: 500, statusText: 'Server Error' });
    await pendiente;

    expect(servicio.cambios()).toBe(antes);
  });

  it('las lecturas no invalidan nada', async () => {
    const antes = servicio.cambios();

    const pendiente = servicio.obtener('a1');
    pruebas.expectOne(r => r.method === 'GET').flush({ id: 'a1' });
    await pendiente;

    expect(servicio.cambios()).toBe(antes);
  });

  it('el contador solo avanza, para que un `===` baste como «algo cambió»', async () => {
    const vistos: number[] = [servicio.cambios()];
    for (const [, ejecutar, metodo] of MUTACIONES) {
      const pendiente = ejecutar(servicio);
      pruebas.expectOne(r => r.method === metodo).flush({ id: 'a1' });
      await pendiente;
      vistos.push(servicio.cambios());
    }
    expect(vistos).toEqual([...vistos].sort((a, b) => a - b));
    expect(new Set(vistos).size).toBe(vistos.length);
  });
});
