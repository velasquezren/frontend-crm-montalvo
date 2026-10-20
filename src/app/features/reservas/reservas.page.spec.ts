import '@angular/compiler';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ToastService } from '../../core/toast/toast.service';
import { PaginaReservas, ReservaAgenda } from './reserva.model';
import { ReservasPage } from './reservas.page';

const reserva: ReservaAgenda = {
  id: 42, fecha: '2026-10-13', hora: '09:30', medicoId: 1, medico: 'Dra. Sintética', especialidad: 'Ginecología',
  paciente: 'María Sintética', telefono: '+591 709-87654', telefonoE164: '+59170987654', ci: '111222', observaciones: null,
  estado: 'PAGADO', precio: { importeCentavos: 40025, moneda: 'BOB' }, nit: null, razonSocial: null, tieneComprobante: true,
  registradaEl: '2026-10-06', registradaA: '08:30',
};
const pagina = (datos: ReservaAgenda[], porEstado: Record<string, number> = {}): PaginaReservas => ({
  datos, total: datos.length, pagina: 1, limite: 25, totalPaginas: 1, porEstado, desde: '2026-10-07', hasta: '2026-11-05',
});

describe('pantalla Reservas', () => {
  let fixture: ComponentFixture<ReservasPage>;
  let http: HttpTestingController;
  let toast: { error: ReturnType<typeof vi.fn>; success: ReturnType<typeof vi.fn>; show: ReturnType<typeof vi.fn> };
  async function asentar() {
    for (let i = 0; i < 4; i++) { await Promise.resolve(); TestBed.tick(); }
    fixture.detectChanges();
  }
  async function montar() {
    toast = { error: vi.fn(), success: vi.fn(), show: vi.fn() };
    TestBed.configureTestingModule({ providers: [
      provideHttpClient(), provideHttpClientTesting(), provideRouter([]),
      { provide: ToastService, useValue: toast },
    ] });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(ReservasPage);
    fixture.detectChanges();
    await asentar();
  }
  afterEach(() => { fixture?.destroy(); http.verify(); });

  it('pide los próximos 30 días y pinta la reserva con su estado, su precio y los contadores', async () => {
    await montar();
    const pedido = http.expectOne(r => r.url.endsWith('/agenda/reservas'));
    expect(pedido.request.params.get('desde')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(pedido.request.params.has('estado')).toBe(false);
    pedido.flush(pagina([reserva], { PAGADO: 1, PENDIENTE: 3 }));
    await asentar();
    const texto = (fixture.nativeElement as HTMLElement).textContent!;
    expect(texto).toContain('María Sintética');
    expect(texto).toContain('mar 13 oct');
    expect(texto).toContain('Pago por verificar');
    expect(texto).toContain('Bs 400,25');
    expect(texto).toMatch(/Todas\s*4/);
  });

  it('una agenda que no responde no se lee como «no hay reservas»', async () => {
    await montar();
    http.expectOne(r => r.url.endsWith('/agenda/reservas')).flush({ codigo: 'AGENDA_NO_DISPONIBLE' }, { status: 503, statusText: 'Unavailable' });
    await asentar();
    const texto = (fixture.nativeElement as HTMLElement).textContent!;
    expect(texto).toContain('Reintentar');
    expect(texto).not.toContain('No hay reservas en este periodo');
  });

  it('filtrar por estado pide ese estado al servidor', async () => {
    await montar();
    http.expectOne(r => r.url.endsWith('/agenda/reservas')).flush(pagina([reserva], { PAGADO: 1 }));
    await asentar();
    const chip = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button')).find(b => b.textContent?.includes('Por confirmar'))!;
    chip.click();
    await asentar();
    const pedido = http.expectOne(r => r.url.endsWith('/agenda/reservas'));
    expect(pedido.request.params.get('estado')).toBe('PENDIENTE');
    expect(pedido.request.params.get('pagina')).toBe('1');
    pedido.flush(pagina([]));
    await asentar();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Ninguna reserva con ese filtro');
  });

  /* Se refresca sola cada 2 minutos contra el MySQL de ScriptCase: una vuelta
     fallida no puede cambiarle a recepción la tabla que está leyendo por un error. */
  it('si una actualización falla, la tabla se queda con un aviso; si vuelve, el aviso se va', async () => {
    await montar();
    http.expectOne(r => r.url.endsWith('/agenda/reservas')).flush(pagina([reserva], { PAGADO: 1 }));
    await asentar();

    const boton = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button')).find(b => b.textContent?.includes('Actualizar'))!;
    boton.click();
    await asentar();
    http.expectOne(r => r.url.endsWith('/agenda/reservas')).flush({ codigo: 'AGENDA_NO_DISPONIBLE' }, { status: 503, statusText: 'Unavailable' });
    await asentar();
    let texto = (fixture.nativeElement as HTMLElement).textContent!;
    expect(texto).toContain('María Sintética');
    expect(texto).toContain('No se pudo actualizar la agenda');

    const reintentar = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button')).find(b => b.textContent?.trim() === 'Reintentar')!;
    reintentar.click();
    await asentar();
    http.expectOne(r => r.url.endsWith('/agenda/reservas')).flush(pagina([reserva], { PAGADO: 1 }));
    await asentar();
    texto = (fixture.nativeElement as HTMLElement).textContent!;
    expect(texto).not.toContain('No se pudo actualizar la agenda');
  });

  it('un filtro nuevo que falla no muestra la tabla del filtro anterior', async () => {
    await montar();
    http.expectOne(r => r.url.endsWith('/agenda/reservas')).flush(pagina([reserva], { PAGADO: 1 }));
    await asentar();
    const chip = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button')).find(b => b.textContent?.includes('Hoy'))!;
    chip.click();
    await asentar();
    http.expectOne(r => r.url.endsWith('/agenda/reservas')).flush({}, { status: 503, statusText: 'Unavailable' });
    await asentar();
    const texto = (fixture.nativeElement as HTMLElement).textContent!;
    expect(texto).not.toContain('María Sintética');
    expect(texto).toContain('Reintentar');
  });

  it('si el navegador bloquea la pestaña del PDF, el aviso trae «Abrir», que sí la abre', async () => {
    await montar();
    http.expectOne(r => r.url.endsWith('/agenda/reservas')).flush(pagina([reserva], { PAGADO: 1 }));
    await asentar();
    const abrir = vi.spyOn(window, 'open').mockReturnValueOnce(null).mockReturnValueOnce({ opener: window } as unknown as Window);
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:comprobante');

    const pagina_ = fixture.componentInstance as unknown as { verComprobante(r: ReservaAgenda): Promise<void> };
    const vista = pagina_.verComprobante(reserva);
    http.expectOne(r => r.url.endsWith('/agenda/reservas/42/comprobante')).flush(new Blob(['%PDF'], { type: 'application/pdf' }));
    await vista;

    expect(abrir).toHaveBeenCalledTimes(1);
    expect(toast.show).toHaveBeenCalledTimes(1);
    const [, , , , accion, alPulsar] = toast.show.mock.calls[0] as [string, string, string, number, string, () => void];
    expect(accion).toBe('Abrir');
    alPulsar();
    expect(abrir).toHaveBeenCalledTimes(2);
    expect(abrir.mock.calls[1]).toEqual(['blob:comprobante', '_blank']);
    abrir.mockRestore();
  });
});

describe('Reservas: período, estado y búsqueda en la URL', () => {
  let fixture: ComponentFixture<ReservasPage>;
  let http: HttpTestingController;
  let navegar: ReturnType<typeof vi.spyOn>;
  async function asentar() {
    for (let i = 0; i < 4; i++) { await Promise.resolve(); TestBed.tick(); }
    fixture.detectChanges();
  }
  async function montar(params: Record<string, string>) {
    const mapa = convertToParamMap(params);
    TestBed.configureTestingModule({ providers: [
      provideHttpClient(), provideHttpClientTesting(), provideRouter([]),
      { provide: ToastService, useValue: { error: vi.fn(), success: vi.fn(), show: vi.fn() } },
      { provide: ActivatedRoute, useValue: { queryParamMap: new BehaviorSubject(mapa), snapshot: { queryParamMap: mapa } } },
    ] });
    http = TestBed.inject(HttpTestingController);
    navegar = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    fixture = TestBed.createComponent(ReservasPage);
    fixture.detectChanges();
    await asentar();
  }
  afterEach(() => { fixture?.destroy(); http.verify(); vi.restoreAllMocks(); TestBed.resetTestingModule(); });

  it('F5 con filtros pide lo mismo que se estaba viendo y no reescribe la URL', async () => {
    await montar({ periodo: 'pasados', estado: 'PAGADO', q: 'maria' });
    const pedido = http.expectOne(r => r.url.endsWith('/agenda/reservas'));
    expect(pedido.request.params.get('estado')).toBe('PAGADO');
    expect(pedido.request.params.get('buscar')).toBe('maria');
    expect(pedido.request.params.get('hasta')! <= new Date().toISOString().slice(0, 10)).toBe(true);
    pedido.flush(pagina([]));
    await asentar();
    expect(navegar).not.toHaveBeenCalled();
  });

  it('un valor que no existe en la agenda cae al defecto en vez de pedirlo', async () => {
    await montar({ periodo: 'siempre', estado: 'BORRADO' });
    const pedido = http.expectOne(r => r.url.endsWith('/agenda/reservas'));
    expect(pedido.request.params.has('estado')).toBe(false);
    pedido.flush(pagina([]));
    await asentar();
    expect(navegar).toHaveBeenCalledWith([], expect.objectContaining({
      queryParams: { periodo: null, estado: null, q: null }, replaceUrl: true,
    }));
  });

  it('con un enlace a una reserva no escribe filtros en la URL', async () => {
    await montar({ reserva: '42', fecha: '2026-10-13' });
    const pedidos = http.match(r => r.url.endsWith('/agenda/reservas'));
    expect(pedidos.at(-1)!.request.params.get('buscar')).toBe('42');
    pedidos.filter(p => !p.cancelled).forEach(p => p.flush(pagina([])));
    await asentar();
    const llamadas = navegar.mock.calls as [unknown, { queryParams: object }][];
    expect(llamadas.every(([, extras]) => !('q' in extras.queryParams))).toBe(true);
  });
});
