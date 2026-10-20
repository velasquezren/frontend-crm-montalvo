import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, ParamMap, provideRouter, Router } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { pestanaServiciosDe, ServiciosPage } from './servicios.page';
import { ServiciosService } from './servicios.service';

describe('Servicios: paneles retenidos y estilos especializados', () => {
  afterEach(() => vi.unstubAllGlobals());

  async function montar() {
    vi.stubGlobal('IntersectionObserver', class { observe() {} unobserve() {} disconnect() {} });
    TestBed.configureTestingModule({
      imports: [ServiciosPage],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]), {
        provide: ServiciosService,
        useValue: {
          periodosRequest: () => undefined, dashboardRequest: () => undefined,
          demografiaRequest: () => undefined, pacientesRequest: () => undefined,
          medicosRequest: () => undefined,
        },
      }],
    });
    await TestBed.compileComponents();
    const fixture = TestBed.createComponent(ServiciosPage);
    await fixture.whenStable();
    return fixture;
  }

  it('el teclado cambia de pestaña y conserva montado pero oculto el panel anterior', async () => {
    const fixture = await montar();
    const root: HTMLElement = fixture.nativeElement;
    const resumen = root.querySelector<HTMLElement>('#panel-DASHBOARD')!;
    // Comprueba la conexión entre plantilla y CSS encapsulado, no geometría real.
    expect(getComputedStyle(resumen).display).toBe('flex');
    const tab = root.querySelector<HTMLButtonElement>('#tab-DASHBOARD')!;
    tab.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    await fixture.whenStable();
    const pacientes = root.querySelector<HTMLElement>('#panel-PACIENTES')!;
    expect(root.querySelector('#panel-DASHBOARD')).toBe(resumen);
    expect(resumen.hidden).toBe(true);
    expect(getComputedStyle(resumen).display).toBe('none');
    expect(pacientes.hidden).toBe(false);
    expect(getComputedStyle(pacientes).display).toBe('flex');
    root.querySelector<HTMLButtonElement>('#tab-PACIENTES')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    await fixture.whenStable();
    expect(resumen.hidden).toBe(false);
    expect(pacientes.hidden).toBe(true);
    expect(root.querySelector('#panel-PACIENTES')).toBe(pacientes);
    expect(root.querySelectorAll('[role="tab"][tabindex="0"]').length).toBe(1);
    fixture.destroy();
  });

  it('los gráficos demográficos conservan el padding del subpanel al centralizar el panel exterior', async () => {
    const fixture = await montar();
    fixture.componentInstance['dashboard'].value.set({
      totales: { servicios: 1, pacientes: 1, medicos: 0, ingreso: 0 },
      cobertura: { servicios: 1, conCodigo: 1, conFicha: 1 },
      porModulo: [], porClasif: [], topServicios: [], porMedico: [], porMes: [],
    });
    fixture.componentInstance['demografia'].value.set({
      total: 1, visitasPromedio: 1, saldoAcumulado: 0,
      porSexo: [], porDepartamento: [], porTramoEdad: [],
    });
    await fixture.whenStable();
    const graficos = fixture.nativeElement.querySelectorAll('.crm-grid-dos app-donut-chart') as NodeListOf<HTMLElement>;
    expect(graficos.length).toBe(2);
    for (const grafico of graficos) expect(getComputedStyle(grafico.parentElement!).padding).toBe('16px');
    fixture.destroy();
  });
});

describe('Servicios: la pestaña vive en la URL', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); TestBed.resetTestingModule(); });

  function montar(params: Record<string, string> = {}) {
    vi.stubGlobal('IntersectionObserver', class { observe() {} unobserve() {} disconnect() {} });
    const query = new BehaviorSubject<ParamMap>(convertToParamMap(params));
    TestBed.configureTestingModule({
      imports: [ServiciosPage],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]),
        { provide: ActivatedRoute, useValue: { queryParamMap: query, snapshot: { queryParamMap: query.value } } },
        { provide: ServiciosService, useValue: {
          periodosRequest: () => undefined, dashboardRequest: () => undefined,
          demografiaRequest: () => undefined, pacientesRequest: () => undefined,
          medicosRequest: () => undefined,
        } }],
    });
    const navegar = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const fixture = TestBed.createComponent(ServiciosPage);
    fixture.detectChanges();
    return { fixture, query, navegar };
  }

  it('lee ?tab= en minúsculas y lo desconocido es el resumen', () => {
    expect(pestanaServiciosDe('pacientes')).toBe('PACIENTES');
    expect(pestanaServiciosDe('medicos')).toBe('MEDICOS');
    expect(pestanaServiciosDe(null)).toBe('DASHBOARD');
    expect(pestanaServiciosDe('PACIENTES')).toBe('DASHBOARD');
    expect(pestanaServiciosDe('otra')).toBe('DASHBOARD');
  });

  it('F5 en ?tab=pacientes abre Pacientes y no monta el resumen', async () => {
    const { fixture } = montar({ tab: 'pacientes' });
    await fixture.whenStable();
    const root: HTMLElement = fixture.nativeElement;
    expect(root.querySelector<HTMLElement>('#panel-PACIENTES')!.hidden).toBe(false);
    expect(root.querySelector('#tab-PACIENTES')!.getAttribute('aria-selected')).toBe('true');
    expect(root.querySelector('#panel-DASHBOARD')).toBeNull();
    fixture.destroy();
  });

  it('cambiar de pestaña reemplaza la URL, y el resumen la deja limpia', async () => {
    const { fixture, navegar } = montar();
    await fixture.whenStable();
    const root: HTMLElement = fixture.nativeElement;
    root.querySelector<HTMLButtonElement>('#tab-MEDICOS')!.click();
    expect(navegar).toHaveBeenLastCalledWith([], expect.objectContaining({ queryParams: { tab: 'medicos' }, replaceUrl: true }));
    root.querySelector<HTMLButtonElement>('#tab-DASHBOARD')!.click();
    expect(navegar).toHaveBeenLastCalledWith([], expect.objectContaining({ queryParams: { tab: null } }));
    fixture.destroy();
  });

  it('Atrás (la URL cambia sola) mueve la pestaña sin navegar otra vez', async () => {
    const { fixture, query, navegar } = montar({ tab: 'medicos' });
    await fixture.whenStable();
    query.next(convertToParamMap({ tab: 'pacientes' }));
    await fixture.whenStable();
    const root: HTMLElement = fixture.nativeElement;
    expect(root.querySelector<HTMLElement>('#panel-PACIENTES')!.hidden).toBe(false);
    expect(root.querySelector<HTMLElement>('#panel-MEDICOS')!.hidden).toBe(true);
    expect(navegar).not.toHaveBeenCalled();
    fixture.destroy();
  });
});
