import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ActividadesCalendarioComponent } from './actividades-calendario.component';
import { Actividad } from '../../actividad.model';

describe('Calendario real · compatibilidad y eventos', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.unstubAllGlobals();
  });

  it('publica el primer rango después del montaje, sin pulsar siguiente mes', async () => {
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
    vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
    const fixture = TestBed.createComponent(ActividadesCalendarioComponent);
    fixture.componentRef.setInput('actividades', []);
    const rangos: Array<{ desde: string; hasta: string }> = [];
    fixture.componentInstance.rangoVisible.subscribe(rango => rangos.push(rango));
    fixture.detectChanges();
    await vi.waitFor(() => expect(rangos.length).toBeGreaterThan(0));
    const hoy = Date.now();
    expect(Date.parse(rangos[0].desde)).toBeLessThan(hoy);
    expect(Date.parse(rangos[0].hasta)).toBeGreaterThan(hoy);
    fixture.destroy();
  });

  it('inicializa Schedule-X y acepta actividades con la misma implementación de Temporal', () => {
    // Se conserva el calendario real: el doble usado por la página no descubre
    // un global ausente ni la mezcla de Temporal nativo y polyfill.
    TestBed.overrideComponent(ActividadesCalendarioComponent, { set: { template: '' } });
    const fixture = TestBed.createComponent(ActividadesCalendarioComponent);
    const actividad: Actividad = {
      id: 'actividad-1', titulo: 'Confirmar cita', tipo: 'LLAMADA', estado: 'PENDIENTE',
      fechaProgramada: '2026-09-21T18:00:00Z', duracionMinutos: 15, notas: null,
      completadaEn: null, createdAt: '2026-09-20T18:00:00Z', updatedAt: '2026-09-20T18:00:00Z',
      cliente: { id: 'cliente-1', nombre: 'Paciente de prueba', telefono: '+59170000000' },
      agente: { id: 'agente-1', nombre: 'Recepción' }, lead: null,
      serieId: null, frecuenciaSerie: null,
    };
    fixture.componentRef.setInput('actividades', [actividad]);
    fixture.detectChanges();
    const eventos = fixture.componentInstance['calendarApp'].events.getAll();
    expect(eventos).toHaveLength(1);
    expect(eventos[0].title).toBe('Confirmar cita');
    expect(eventos[0].start.toString()).toBe('2026-09-21T14:00:00-04:00[America/La_Paz]');
    fixture.componentRef.setInput('actividades', []);
    fixture.detectChanges();
    expect(fixture.componentInstance['calendarApp'].events.getAll()).toHaveLength(0);
    fixture.destroy();
  });
});
