import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, ParamMap, provideRouter, Router } from '@angular/router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { reflejarEnUrl } from './reflejar-en-url';

@Component({ selector: 'app-lista-doble', changeDetection: ChangeDetectionStrategy.OnPush, template: '' })
class ListaDoble {
  /* Como una página: el estado inicial sale de la URL. */
  private readonly url = inject(ActivatedRoute).snapshot.queryParamMap;
  readonly estado = signal<string | null>(this.url.get('estado'));
  readonly q = signal(this.url.get('q') ?? '');
  constructor() {
    reflejarEnUrl(() => ({ estado: this.estado(), q: this.q() || null }));
  }
}

describe('reflejarEnUrl', () => {
  afterEach(() => { vi.restoreAllMocks(); TestBed.resetTestingModule(); });

  function montar(params: Record<string, string> = {}) {
    const ruta = { snapshot: { queryParamMap: convertToParamMap(params) as ParamMap } };
    TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: ActivatedRoute, useValue: ruta }] });
    const navegar = vi.spyOn(TestBed.inject(Router), 'navigate').mockImplementation(async (_, extras) => {
      /* Como el router de verdad: tras navegar, el snapshot dice lo nuevo. */
      const actual = Object.fromEntries(ruta.snapshot.queryParamMap.keys.map(k => [k, ruta.snapshot.queryParamMap.get(k)]));
      const nuevo = { ...actual, ...extras?.queryParams };
      ruta.snapshot.queryParamMap = convertToParamMap(Object.fromEntries(Object.entries(nuevo).filter(([, v]) => v !== null)));
      return true;
    });
    const fixture = TestBed.createComponent(ListaDoble);
    TestBed.tick();
    return { lista: fixture.componentInstance, navegar, ruta };
  }

  it('abrir con filtros en la URL no la reescribe', () => {
    const { navegar } = montar({ estado: 'GANADA', q: 'ana' });
    expect(navegar).not.toHaveBeenCalled();
  });

  it('volver a poner lo que la URL ya dice no navega otra vez', () => {
    const { lista, navegar } = montar();
    lista.estado.set('GANADA');
    TestBed.tick();
    lista.estado.set('PERDIDA');
    lista.estado.set('GANADA');
    TestBed.tick();
    expect(navegar).toHaveBeenCalledTimes(1);
  });

  it('un cambio reemplaza la URL, con merge para no tocar otros parámetros', () => {
    const { lista, navegar } = montar();
    lista.estado.set('PERDIDA');
    TestBed.tick();
    expect(navegar).toHaveBeenCalledTimes(1);
    expect(navegar).toHaveBeenCalledWith([], expect.objectContaining({
      queryParams: { estado: 'PERDIDA', q: null }, queryParamsHandling: 'merge', replaceUrl: true,
    }));
  });

  it('varios cambios seguidos son una sola navegación', () => {
    const { lista, navegar } = montar();
    lista.estado.set('GANADA');
    lista.q.set('ana');
    TestBed.tick();
    expect(navegar).toHaveBeenCalledTimes(1);
    expect(navegar).toHaveBeenLastCalledWith([], expect.objectContaining({ queryParams: { estado: 'GANADA', q: 'ana' } }));
  });

  it('volver al valor por defecto saca el parámetro (null) y no deja otros fuera', () => {
    const { lista, navegar, ruta } = montar({ estado: 'GANADA', id: 'venta-1' });
    lista.estado.set(null);
    TestBed.tick();
    expect(navegar).toHaveBeenLastCalledWith([], expect.objectContaining({ queryParams: { estado: null, q: null } }));
    expect(ruta.snapshot.queryParamMap.get('id')).toBe('venta-1');
    expect(ruta.snapshot.queryParamMap.has('estado')).toBe(false);
  });
});
