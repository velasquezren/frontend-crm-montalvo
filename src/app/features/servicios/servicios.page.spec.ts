import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ServiciosPage } from './servicios.page';
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
