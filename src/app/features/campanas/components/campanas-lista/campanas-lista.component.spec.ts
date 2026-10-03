import '@angular/compiler';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { paginaVacia } from '../../../../core/api/pagination.model';
import { AuthService } from '../../../../core/auth/auth.service';
import { CampanasListaComponent } from './campanas-lista.component';

describe('ficha de campañas y errores de carga', () => {
  let fixture: ComponentFixture<CampanasListaComponent>;
  let http: HttpTestingController;
  async function asentar() {
    for (let i = 0; i < 4; i++) { await Promise.resolve(); TestBed.tick(); }
  }
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    TestBed.configureTestingModule({ providers: [
      provideHttpClient(), provideHttpClientTesting(), provideRouter([]),
      { provide: AuthService, useValue: { isSuperAdmin: signal(false) } },
    ] });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(CampanasListaComponent);
    fixture.detectChanges();
    await asentar();
  });
  afterEach(() => { fixture.destroy(); http.verify(); vi.restoreAllMocks(); vi.useRealTimers(); });

  it('un listado fallido no rompe los derivados y muestra el reintento', async () => {
    http.expectOne(r => r.url.endsWith('/campanas')).flush({}, { status: 503, statusText: 'Unavailable' });
    await asentar();
    expect(fixture.componentInstance['hayCampanas']()).toBe(false);
    expect(fixture.nativeElement.textContent).toContain('Reintentar');
  });

  it('refresca entregas de una campaña terminada; pausa en pestaña oculta y limpia al cerrar', async () => {
    http.expectOne(r => r.url.endsWith('/campanas')).flush(paginaVacia());
    const c = fixture.componentInstance;
    c['seleccionadaId'].set('c1');
    await asentar();
    // La ficha se consume al proyectar el drawer: aquí basta su contrato de estado.
    http.expectOne(r => r.url.endsWith('/campanas/c1')).flush({ id: 'c1', estado: 'TERMINADA' });
    http.expectOne(r => r.url.endsWith('/destinatarios')).flush(paginaVacia());
    await asentar();
    const visibilidad = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    vi.advanceTimersByTime(60_000);
    await asentar();
    const refrescos = http.match(() => true);
    expect(refrescos).toHaveLength(3);
    for (const r of refrescos) r.flush(r.request.url.endsWith('/campanas/c1') ? { id: 'c1', estado: 'TERMINADA' } : paginaVacia());
    await asentar();
    visibilidad.mockReturnValue('hidden');
    vi.advanceTimersByTime(60_000);
    await asentar();
    http.expectNone(() => true);
    c['cerrar']();
    await asentar();
    visibilidad.mockReturnValue('visible');
    vi.advanceTimersByTime(60_000);
    await asentar();
    http.expectNone(() => true);
  });
});
