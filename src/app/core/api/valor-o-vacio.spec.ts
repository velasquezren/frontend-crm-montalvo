import { provideHttpClient } from '@angular/common/http';
import { httpResource } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ApplicationRef, Injector, runInInjectionContext } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { valorOVacio } from './valor-o-vacio';

describe('valorOVacio', () => {
  it('da el valor, lo conserva al recargar y cae al vacío si la carga falla (sin lanzar)', async () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    const http = TestBed.inject(HttpTestingController);
    const injector = TestBed.inject(Injector);
    const { recurso, vista } = runInInjectionContext(injector, () => {
      const recurso = httpResource<{ total: number }>(() => '/cuenta', { defaultValue: { total: 0 } });
      return { recurso, vista: valorOVacio(recurso, { total: -1 }) };
    });
    TestBed.tick();
    http.expectOne('/cuenta').flush({ total: 7 });
    await TestBed.inject(ApplicationRef).whenStable();
    expect(vista()).toEqual({ total: 7 });

    recurso.reload();
    TestBed.tick();
    expect(vista()).toEqual({ total: 7 });
    http.expectOne('/cuenta').flush({}, { status: 503, statusText: 'Unavailable' });
    await TestBed.inject(ApplicationRef).whenStable();

    expect(() => recurso.value()).toThrow();
    expect(vista()).toEqual({ total: -1 });
  });
});
