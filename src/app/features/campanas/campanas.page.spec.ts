import '@angular/compiler';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, ParamMap, provideRouter, Route, Router, UrlTree } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { routes } from '../../app.routes';
import { paginaVacia } from '../../core/api/pagination.model';
import { AuthService } from '../../core/auth/auth.service';
import { paginaAudienciaVacia } from './audiencia.model';
import { CampanasPage, tabCampanasDe } from './campanas.page';

/**
 * Audiencias y Campañas eran dos páginas; ahora son dos pestañas de una. Lo
 * que se fija aquí es lo que se rompería sin avisar: qué pestaña pide sus datos,
 * que volver a una no los pida otra vez, que la URL mande y que crear una
 * campaña lleve a su ficha.
 */
describe('Campañas: audiencia y campañas en una página', () => {
  let http: HttpTestingController;
  let query: BehaviorSubject<ParamMap>;
  let navegar: ReturnType<typeof vi.fn>;

  async function asentar() {
    for (let i = 0; i < 4; i++) { await Promise.resolve(); TestBed.tick(); }
  }

  function montar(params: Record<string, string> = {}) {
    query = new BehaviorSubject(convertToParamMap(params));
    TestBed.configureTestingModule({ providers: [
      provideHttpClient(), provideHttpClientTesting(), provideRouter([]),
      { provide: AuthService, useValue: { isSuperAdmin: signal(false) } },
      { provide: ActivatedRoute, useValue: { queryParamMap: query, snapshot: { queryParamMap: query.value } } },
    ] });
    http = TestBed.inject(HttpTestingController);
    navegar = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const fixture = TestBed.createComponent(CampanasPage);
    fixture.detectChanges();
    return fixture;
  }

  const pidioLista = () => http.match(r => r.url.endsWith('/campanas'));
  const pidioAudiencia = () => http.match(r => r.url.endsWith('/campanas/audiencia'));

  beforeEach(() => TestBed.resetTestingModule());
  afterEach(() => { http.verify(); vi.restoreAllMocks(); });

  it('abre en «Campañas» y no pide la audiencia hasta que se la mira', async () => {
    const fixture = montar();
    await asentar();
    expect(pidioLista()).toHaveLength(1);
    expect(pidioAudiencia()).toHaveLength(0);
    expect(fixture.nativeElement.querySelector('#panel-audiencia')).toBeNull();
    fixture.destroy();
  });

  it('volver a una pestaña no la vuelve a pedir: se queda montada y solo se aparta', async () => {
    const fixture = montar();
    await asentar();
    pidioLista().forEach(r => r.flush(paginaVacia()));

    fixture.componentInstance['cambiarTab']('audiencia');
    fixture.detectChanges();
    await asentar();
    pidioAudiencia().forEach(r => r.flush(paginaAudienciaVacia()));
    // La línea de WhatsApp no se pide aquí: el cajón de nueva campaña no está abierto.
    expect(navegar).toHaveBeenCalledWith([], expect.objectContaining({ queryParams: { tab: 'audiencia' }, replaceUrl: true }));

    fixture.componentInstance['cambiarTab']('campanas');
    fixture.detectChanges();
    await asentar();
    expect(pidioLista()).toHaveLength(0);
    const audiencia: HTMLElement = fixture.nativeElement.querySelector('#panel-audiencia');
    expect(audiencia.classList).toContain('crm-pestana-panel-oculta');
    expect(audiencia.hasAttribute('inert')).toBe(true);
    expect(navegar).toHaveBeenLastCalledWith([], expect.objectContaining({ queryParams: { tab: null } }));
    fixture.destroy();
  });

  it('la URL manda: `?tab=audiencia` abre ahí, y Atrás vuelve a «Campañas»', async () => {
    const fixture = montar({ tab: 'audiencia' });
    await asentar();
    expect(pidioAudiencia()).toHaveLength(1);
    expect(pidioLista()).toHaveLength(0);

    query.next(convertToParamMap({}));
    fixture.detectChanges();
    await asentar();
    expect(fixture.componentInstance['tabActiva']()).toBe('campanas');
    expect(pidioLista()).toHaveLength(1);
    fixture.destroy();
  });

  it('crear una campaña lleva a «Campañas» con su ficha (`?id=`)', async () => {
    const fixture = montar({ tab: 'audiencia' });
    await asentar();
    pidioAudiencia().forEach(r => r.flush(paginaAudienciaVacia()));

    fixture.componentInstance['alCrearCampana']({ id: 'c-nueva' } as never);
    fixture.detectChanges();
    await asentar();
    expect(fixture.componentInstance['tabActiva']()).toBe('campanas');
    expect(navegar).toHaveBeenLastCalledWith([], expect.objectContaining({ queryParams: { tab: null, id: 'c-nueva' } }));
    pidioLista().forEach(r => r.flush(paginaVacia()));
    fixture.destroy();
  });

  it('una pestaña desconocida en la URL cae en «Campañas»', () => {
    expect(tabCampanasDe('audiencia')).toBe('audiencia');
    expect(tabCampanasDe('nada')).toBe('campanas');
    expect(tabCampanasDe(null)).toBe('campanas');
  });

  /* Un marcador a la página vieja no puede llevar a una pantalla en blanco. */
  it('/audiencias redirige a la pestaña «Audiencia» de Campañas', () => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const buscar = (lista: readonly Route[]): Route | undefined =>
      lista.flatMap(r => [r, ...(r.children ? [buscar(r.children)].filter(Boolean) as Route[] : [])]).find(r => r.path === 'audiencias');
    const ruta = buscar(routes);
    expect(typeof ruta?.redirectTo).toBe('function');
    const destino = TestBed.runInInjectionContext(() => (ruta!.redirectTo as () => UrlTree)());
    expect(TestBed.inject(Router).serializeUrl(destino)).toBe('/campanas?tab=audiencia');
  });
});
