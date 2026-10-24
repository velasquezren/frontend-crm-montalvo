import '@angular/compiler';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ErrorHandler, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { RealtimeService } from '../../core/realtime/realtime.service';
import { ToastService } from '../../core/toast/toast.service';
import { ResultadosPage } from './resultados.page';

/*
 * La cola viene del portal de resultados, otro servicio. Con la carga en error,
 * `value()` LANZA (Angular 21): un efecto que la leía sin preguntar reventaba con
 * CADA mensaje de WhatsApp que llegaba al CRM mientras el portal estaba caído.
 */
describe('Resultados con el portal caído', () => {
  let fixture: ComponentFixture<ResultadosPage>;
  let http: HttpTestingController;
  const actividad = signal<{ conversacionId: string; ts: number } | null>(null);
  const errores = vi.fn();

  async function asentar() {
    for (let i = 0; i < 4; i++) { await Promise.resolve(); TestBed.tick(); }
    fixture.detectChanges();
  }

  afterEach(() => { fixture?.destroy(); errores.mockReset(); actividad.set(null); });

  it('un mensaje de WhatsApp que llega no revienta la pantalla, y el error se sigue viendo', async () => {
    TestBed.configureTestingModule({ providers: [
      provideHttpClient(), provideHttpClientTesting(), provideRouter([]),
      { provide: ToastService, useValue: { error: vi.fn(), success: vi.fn(), info: vi.fn(), warning: vi.fn() } },
      { provide: RealtimeService, useValue: { actividad } },
      { provide: ErrorHandler, useValue: { handleError: errores } },
    ] });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(ResultadosPage);
    fixture.detectChanges();
    await asentar();
    http.expectOne(r => r.url.endsWith('/resultados/pendientes'))
      .flush({ message: 'Portal no disponible' }, { status: 503, statusText: 'Unavailable' });
    await asentar();

    actividad.set({ conversacionId: 'chat-cualquiera', ts: Date.now() });
    await asentar();

    expect(errores).not.toHaveBeenCalled();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Reintentar');
    http.verify();
  });
  it('cambiar de tipo solicita una nueva página al servidor y conserva el filtro en la URL', async () => {
    TestBed.configureTestingModule({ providers: [
      provideHttpClient(), provideHttpClientTesting(), provideRouter([]),
      { provide: RealtimeService, useValue: { actividad } },
    ] });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(ResultadosPage);
    fixture.detectChanges();
    await asentar();
    const vacio = { datos: [], total: 0, pagina: 1, limite: 25, totalPaginas: 1, truncado: false,
      contadores: { POR_AVISAR: 0, ESPERANDO: 0, VENCIDOS: 0, ABIERTOS: 0, TODOS: 0 } };
    http.expectOne(r => r.url.endsWith('/resultados/pendientes')).flush(vacio);
    await asentar();
    fixture.componentInstance['pagina'].set(3);
    await asentar();
    http.expectOne(r => r.params.get('pagina') === '3').flush({ ...vacio, pagina: 3 });
    await asentar();
    const selector: HTMLSelectElement = fixture.nativeElement.querySelector('select');
    selector.value = 'PAPANICOLAU'; selector.dispatchEvent(new Event('change'));
    await asentar();
    const peticion = http.expectOne(r => r.params.get('tipo') === 'PAPANICOLAU');
    expect(peticion.request.params.get('pagina')).toBe('1');
    peticion.flush(vacio);
    await asentar();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Sin informes con estos filtros');
    expect(TestBed.inject(Router).url).toContain('tipo=PAPANICOLAU');
    http.verify();
  });

});
