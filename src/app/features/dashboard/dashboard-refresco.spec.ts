import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthService } from '../../core/auth/auth.service';
import { DashboardPage } from './dashboard.page';

/**
 * Recepción deja el Dashboard abierto todo el día. Antes se quedaba con los
 * números, la fecha y el «hace 5 min» de la hora en que se abrió (20/10/2026).
 * Basta con contar las peticiones al resumen: el contenido ya tiene sus pruebas.
 */
describe('el Dashboard abierto se actualiza solo', () => {
  let http: HttpTestingController;
  /* Cuántas peticiones al resumen hay, y las contesta: un recurso que sigue
     cargando no se recarga, así que cada una tiene que terminar. Con error,
     para no armar un resumen entero: la vista de error también se actualiza. */
  const pedidos = () => {
    const r = http.match(req => req.url.endsWith('/kpis/resumen'));
    r.forEach(p => p.flush('sintético', { status: 500, statusText: 'Error' }));
    return r;
  };

  beforeEach(() => {
    vi.useFakeTimers();
    /* jsdom da la pestaña por oculta salvo que se diga lo contrario. */
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
    TestBed.configureTestingModule({
      imports: [DashboardPage],
      providers: [
        provideHttpClient(), provideHttpClientTesting(), provideRouter([]),
        { provide: AuthService, useValue: { user: signal({ id: 'a', nombre: 'Agente Prueba' }), isAdmin: signal(false) } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
  });

  it('cada 5 minutos con la pestaña a la vista, y no con la pestaña oculta', async () => {
    const fixture = TestBed.createComponent(DashboardPage);
    fixture.detectChanges(); TestBed.tick();
    expect(pedidos()).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(5 * 60_000);
    fixture.detectChanges(); TestBed.tick();
    expect(pedidos()).toHaveLength(1);

    vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    fixture.detectChanges(); TestBed.tick();
    expect(pedidos()).toHaveLength(0);
    fixture.destroy();
  });

  it('al volver a la pestaña tras un rato, y deja de hacerlo al salir de la página', async () => {
    const fixture = TestBed.createComponent(DashboardPage);
    fixture.detectChanges(); TestBed.tick();
    expect(pedidos()).toHaveLength(1);

    const oculta = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    await vi.advanceTimersByTimeAsync(2 * 60_000);
    oculta.mockReturnValue(false);
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(0);
    fixture.detectChanges(); TestBed.tick();
    expect(pedidos()).toHaveLength(1);

    fixture.destroy();
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(pedidos()).toHaveLength(0);
  });
});
