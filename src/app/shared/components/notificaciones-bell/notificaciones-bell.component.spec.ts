import '@angular/compiler';
import { signal } from '@angular/core';
import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../../core/auth/auth.service';
import { RealtimeService } from '../../../core/realtime/realtime.service';
import { ToastService } from '../../../core/toast/toast.service';
import { NotificacionesBellComponent, finDeHoyIso } from './notificaciones-bell.component';

describe('campana de reservas y actividades', () => {
  let fixture: ComponentFixture<NotificacionesBellComponent>, http: HttpTestingController;
  const cambio = signal<{ actividadId: string; avisar: boolean; ts: number } | null>(null);
  const toast = { show: vi.fn() };
  const reserva = { id: 'actividad-reserva', tipo: 'TAREA', titulo: 'Gestionar reserva #7', reservaAgenda: 7,
    reservaPaciente: 'Paciente sintética', cliente: null, agente: null, estado: 'PENDIENTE', fechaProgramada: '2031-05-10T15:00:00Z' };
  const resumen = { hoy: 1, vencidas: 0, proximaSemana: 0 };
  async function asentar() { for (let i = 0; i < 4; i++) { await Promise.resolve(); TestBed.tick(); } fixture.detectChanges(); }
  beforeEach(async () => {
    cambio.set(null); vi.clearAllMocks();
    TestBed.configureTestingModule({ imports: [NotificacionesBellComponent], providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting(),
      { provide: AuthService, useValue: { user: signal({ id: 'agente' }), generacionSesion: signal(1) } },
      { provide: RealtimeService, useValue: { conectar: vi.fn(), cambioActividad: cambio, recordatorioActividad: signal(null) } },
      { provide: ToastService, useValue: toast },
    ] });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(NotificacionesBellComponent);
    fixture.detectChanges(); await asentar();
  });
  afterEach(() => { fixture.destroy(); http.verify(); TestBed.resetTestingModule(); });
  const responderResumen = () => http.expectOne(r => r.url.endsWith('/actividades/resumen')).flush(resumen);

  it('un fallo del contador se muestra sin romper el panel ni afirmar cero pendientes', async () => {
    http.expectOne(r => r.url.endsWith('/actividades/resumen')).flush({}, { status: 503, statusText: 'No disponible' });
    await asentar();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('!');
    expect((fixture.nativeElement as HTMLElement).querySelector('[aria-label="No se pudo consultar los recordatorios"]')).not.toBeNull();
  });

  it('abre la reserva concreta y no ofrece completarla como si fuera una tarea manual', async () => {
    responderResumen(); await asentar();
    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('[aria-label="Recordatorios y notificaciones"]')!.click();
    await asentar();
    http.expectOne(r => r.url.endsWith('/actividades')).flush({ datos: [reserva], total: 1, pagina: 1, limite: 8, totalPaginas: 1 });
    await asentar();
    const html = fixture.nativeElement as HTMLElement;
    expect(html.textContent).toContain('Paciente sintética');
    expect(html.querySelector('[aria-label="Marcar como completada"]')).toBeNull();
    const navegar = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    html.querySelector<HTMLButtonElement>('li button')!.click();
    expect(navegar).toHaveBeenCalledWith(['/actividades'], { queryParams: { actividad: 'actividad-reserva' } });
  });

  it('el cambio remoto silencioso refresca el contador y no genera un aviso audible', async () => {
    responderResumen(); await asentar();
    cambio.set({ actividadId: reserva.id, avisar: false, ts: 1 }); await asentar();
    await new Promise(resolve => setTimeout(resolve, 180)); await asentar();
    responderResumen(); await asentar();
    expect(toast.show).not.toHaveBeenCalled();
  });

  it('el aviso de reserva abre su seguimiento y no ofrece confirmar el pago', async () => {
    responderResumen(); await asentar();
    cambio.set({ actividadId: reserva.id, avisar: true, ts: 2 }); await asentar();
    http.expectOne(r => r.url.endsWith('/actividades/actividad-reserva')).flush(reserva); await asentar();
    expect(toast.show).toHaveBeenCalledWith(expect.stringContaining('Gestionar reserva'), 'info', 'Reserva por gestionar', 10000, 'Ver reserva', expect.any(Function));
    await new Promise(resolve => setTimeout(resolve, 180)); await asentar(); responderResumen(); await asentar();
  });
});

it('el final de hoy es el de Bolivia aunque ya sea mañana en UTC', () => {
  expect(finDeHoyIso(new Date('2031-05-11T02:00:00Z'))).toBe('2031-05-11T03:59:59.999Z');
});
