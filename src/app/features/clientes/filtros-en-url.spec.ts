import '@angular/compiler';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ToastService } from '../../core/toast/toast.service';
import { ClientesPage } from './clientes.page';

/** Categoría y búsqueda de Pacientes viven en la URL: buscar, abrir otra pantalla y volver deja la misma lista. */
describe('Pacientes: categoría y búsqueda en la URL', () => {
  let fixture: ComponentFixture<ClientesPage>;
  let http: HttpTestingController;
  let navegar: ReturnType<typeof vi.spyOn>;

  async function asentar() {
    for (let i = 0; i < 4; i++) { await Promise.resolve(); TestBed.tick(); }
    fixture.detectChanges();
  }

  async function montar(params: Record<string, string>) {
    vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: () => undefined }));
    TestBed.configureTestingModule({ providers: [
      provideHttpClient(), provideHttpClientTesting(), provideRouter([]),
      { provide: ToastService, useValue: { error: vi.fn(), success: vi.fn(), info: vi.fn() } },
      { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap(params) } } },
    ] });
    http = TestBed.inject(HttpTestingController);
    navegar = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    fixture = TestBed.createComponent(ClientesPage);
    fixture.detectChanges();
    await asentar();
  }

  const ultimoPedido = () => http.match(r => r.url.endsWith('/clientes')).at(-1)!;

  afterEach(() => {
    fixture?.destroy();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
  });

  it('F5 con categoría y búsqueda pide la lista filtrada y no reescribe la URL', async () => {
    await montar({ categoria: 'GOLD', q: 'ana' });
    const pedido = ultimoPedido();
    expect(pedido.request.params.get('categoria')).toBe('GOLD');
    expect(pedido.request.params.get('busqueda')).toBe('ana');
    expect(navegar).not.toHaveBeenCalled();
  });

  it('una categoría que no existe cae a «Todos» y sale de la URL', async () => {
    await montar({ categoria: 'PLATINO' });
    expect(ultimoPedido().request.params.has('categoria')).toBe(false);
    expect(navegar).toHaveBeenCalledWith([], expect.objectContaining({ queryParams: { categoria: null, q: null } }));
  });

  it('cambiar de categoría reemplaza la URL', async () => {
    await montar({});
    fixture.componentInstance['cambiarFiltro']('PROSPECTO');
    await asentar();
    expect(navegar).toHaveBeenLastCalledWith([], expect.objectContaining({
      queryParams: { categoria: 'PROSPECTO', q: null }, queryParamsHandling: 'merge', replaceUrl: true,
    }));
  });
});
