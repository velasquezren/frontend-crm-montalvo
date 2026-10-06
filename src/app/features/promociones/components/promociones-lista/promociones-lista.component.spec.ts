import '@angular/compiler';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, describe, expect, it } from 'vitest';

import { paginaVacia } from '../../../../core/api/pagination.model';
import { AuthService } from '../../../../core/auth/auth.service';
import { PromocionesListaComponent } from './promociones-lista.component';

describe('lista de promociones', () => {
  let fixture: ComponentFixture<PromocionesListaComponent>;
  let http: HttpTestingController;
  async function asentar() {
    for (let i = 0; i < 4; i++) { await Promise.resolve(); TestBed.tick(); }
  }
  async function montar(comercial: boolean) {
    TestBed.configureTestingModule({ providers: [
      provideHttpClient(), provideHttpClientTesting(), provideRouter([]),
      { provide: AuthService, useValue: { puedeGestionComercial: signal(comercial) } },
    ] });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(PromocionesListaComponent);
    fixture.detectChanges();
    await asentar();
  }
  afterEach(() => { fixture?.destroy(); http.verify(); });

  it('un backend caído no se lee como «no hay promociones»: muestra el reintento', async () => {
    await montar(true);
    http.expectOne(r => r.url.endsWith('/promociones')).flush({}, { status: 503, statusText: 'Unavailable' });
    await asentar();
    fixture.detectChanges();
    const texto = fixture.nativeElement.textContent as string;
    expect(texto).toContain('Reintentar');
    expect(texto).not.toContain('Todavía no hay promociones');
  });

  it('vacío: a una agente le ofrece crear; a recepción, no', async () => {
    await montar(true);
    http.expectOne(r => r.url.endsWith('/promociones')).flush(paginaVacia());
    await asentar();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Nueva promoción');
    fixture.destroy();
    TestBed.resetTestingModule();

    await montar(false);
    http.expectOne(r => r.url.endsWith('/promociones')).flush(paginaVacia());
    await asentar();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Todavía no hay promociones');
    expect(fixture.nativeElement.textContent).not.toContain('Nueva promoción');
  });

  it('filtrar por estado pide al servidor ese estado y vuelve a la página 1', async () => {
    await montar(true);
    http.expectOne(r => r.url.endsWith('/promociones')).flush(paginaVacia());
    fixture.componentInstance['pagina'].set(3);
    fixture.componentInstance['filtrar']('EN_REVISION');
    await asentar();
    const pedido = http.expectOne(r => r.url.endsWith('/promociones'));
    expect(pedido.request.params.get('estado')).toBe('EN_REVISION');
    expect(pedido.request.params.get('pagina')).toBe('1');
    pedido.flush(paginaVacia());
  });
});
