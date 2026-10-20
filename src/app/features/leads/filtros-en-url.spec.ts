import '@angular/compiler';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ToastService } from '../../core/toast/toast.service';
import { LeadsPage } from './leads.page';

/**
 * El chip de origen y la búsqueda de Leads viven en la URL. `?origen=` ya
 * llegaba desde el dashboard; ahora el chip también lo escribe, y la búsqueda
 * sobrevive a F5.
 */
describe('Leads: origen y búsqueda en la URL', () => {
  let fixture: ComponentFixture<LeadsPage>;
  let http: HttpTestingController;
  let navegar: ReturnType<typeof vi.spyOn>;

  async function asentar() {
    for (let i = 0; i < 4; i++) { await Promise.resolve(); TestBed.tick(); }
    fixture.detectChanges();
  }

  async function montar(params: Record<string, string>) {
    const ruta = { snapshot: { queryParamMap: convertToParamMap(params) } };
    vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: () => undefined }));
    TestBed.configureTestingModule({ providers: [
      provideHttpClient(), provideHttpClientTesting(), provideRouter([]),
      { provide: ToastService, useValue: { error: vi.fn(), success: vi.fn(), info: vi.fn() } },
      { provide: ActivatedRoute, useValue: ruta },
    ] });
    http = TestBed.inject(HttpTestingController);
    /* Como el router de verdad: tras navegar, el snapshot dice lo nuevo. */
    navegar = vi.spyOn(TestBed.inject(Router), 'navigate').mockImplementation(async (_, extras) => {
      const nuevo = { ...params, ...extras?.queryParams };
      params = Object.fromEntries(Object.entries(nuevo).filter(([, v]) => v !== null)) as Record<string, string>;
      ruta.snapshot.queryParamMap = convertToParamMap(params);
      return true;
    });
    fixture = TestBed.createComponent(LeadsPage);
    /* Lo que hace `withComponentInputBinding` con `?origen=`. */
    if (params['origen']) fixture.componentRef.setInput('origen', params['origen']);
    fixture.detectChanges();
    await asentar();
  }

  const pedidosDeLista = () => http.match(r => r.url.endsWith('/leads'));

  afterEach(() => {
    fixture?.destroy();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
  });

  it('F5 con origen y búsqueda pide la lista filtrada y no reescribe la URL', async () => {
    await montar({ origen: 'PRESENCIAL', q: 'ana' });
    const pedido = pedidosDeLista().at(-1)!;
    expect(pedido.request.params.get('origen')).toBe('PRESENCIAL');
    expect(pedido.request.params.get('q')).toBe('ana');
    expect(navegar).not.toHaveBeenCalled();
  });

  it('elegir un chip escribe ?origen= en la URL, y «Captación activa» lo quita', async () => {
    await montar({});
    fixture.componentInstance['cambiarFiltro']('WHATSAPP_DIRECTO');
    await asentar();
    expect(navegar).toHaveBeenLastCalledWith([], expect.objectContaining({
      queryParams: { origen: 'WHATSAPP_DIRECTO', q: null }, queryParamsHandling: 'merge', replaceUrl: true,
    }));
    fixture.componentInstance['cambiarFiltro']('TODOS');
    await asentar();
    expect(navegar).toHaveBeenLastCalledWith([], expect.objectContaining({ queryParams: { origen: null, q: null } }));
  });
});
