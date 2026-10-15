import '@angular/compiler';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AuthService } from '../../../../core/auth/auth.service';
import { RealtimeService } from '../../../../core/realtime/realtime.service';
import { RolUsuario } from '../../../../core/auth/user.model';
import { ToastService } from '../../../../core/toast/toast.service';
import { FichaMedicoAgenda } from '../../agenda-medicos.model';
import { AgendaMedicoFichaComponent } from './agenda-medico-ficha.component';

const ficha = (version = 'aaaaaaaaaaaaaaaa', activas = ['09:00']): FichaMedicoAgenda => ({
  medico: {
    id: 7, codigo: 'GIN-04', nombre: 'Ana Sintética', sigla: 'Dra.', especialidad: 'Ginecologia', telefono: null, estado: 'ACTIVO',
    precio: '400.00', bancoId: null, orden: 0, reservaEnLinea: activas.length > 0, casillasActivas: activas.length, fotoVersion: null,
  },
  casillas: activas.map((hora, i) => ({ id: i + 1, dia: 'Lunes', hora, activa: true })),
  grilla: { dias: ['Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado'], horas: ['09:00', '09:30'] },
  version,
  presentacion: null,
  fotoUrl: null,
  fotoOrigen: null,
});

/** La ficha web recién creada, sin foto. */
const presentacionSinFoto = {
  id: 'p1', nombrePublico: 'Dra. Ana Sintética', slug: 'dra-ana', resumen: '', biografia: '', matricula: null, precioConsulta: 400,
  publicado: false, orden: 0, version: 1, agendaMedicoId: 7, medico: null, especialidades: [], horario: [], resumenHorario: 'Lunes 9:00–9:30',
  ausencias: [], fotoUrl: null,
};

describe('ficha de un médico de la agenda', () => {
  let fixture: ComponentFixture<AgendaMedicoFichaComponent>;
  let http: HttpTestingController;
  const toast = { error: vi.fn(), success: vi.fn() };
  const realtime = { conectar: vi.fn(), cambioHorario: signal<{ medicoAgendaId: number; ts: number } | null>(null), reconectado: signal(0) };
  async function asentar() {
    for (let i = 0; i < 4; i++) { await Promise.resolve(); TestBed.tick(); }
    fixture.detectChanges();
  }
  async function montar(rol: RolUsuario, leida: FichaMedicoAgenda = ficha()) {
    TestBed.configureTestingModule({ providers: [
      provideHttpClient(), provideHttpClientTesting(), provideRouter([]),
      { provide: ToastService, useValue: toast },
      { provide: AuthService, useValue: { user: signal({ rol }), isAdmin: signal(false) } },
      { provide: RealtimeService, useValue: realtime },
    ] });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(AgendaMedicoFichaComponent);
    fixture.componentRef.setInput('id', 7);
    fixture.detectChanges();
    await asentar();
    http.expectOne(r => r.url.endsWith('/agenda/medicos/7')).flush(leida);
    await asentar();
  }
  const casilla = (etiqueta: string) =>
    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(`button[aria-label="${etiqueta}"]`)!;
  const boton = (texto: string) =>
    Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button')).find(b => b.textContent?.includes(texto));
  afterEach(() => { fixture?.destroy(); http.verify(); vi.clearAllMocks(); realtime.cambioHorario.set(null); realtime.reconectado.set(0); });

  it('con FileMaker muestra el origen y recepción no puede editar las casillas', async () => {
    await montar('RECEPCION', { ...ficha(), sincronizacionHorario: { origen: 'FILEMAKER', pendiente: false, sincronizadoEn: '2026-10-15T12:00:00.000Z' } });
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Horario gestionado en FileMaker');
    expect(casilla('Lunes 09:00').disabled).toBe(true);
    casilla('Martes 09:30').click();
    await asentar();
    expect(boton('Guardar horario')).toBeUndefined();
  });

  it('un aviso de ese médico refresca su horario sin volverlo editable', async () => {
    const origen = { origen: 'FILEMAKER' as const, pendiente: false, sincronizadoEn: '2026-10-15T12:00:00.000Z' };
    await montar('ADMIN', { ...ficha(), sincronizacionHorario: origen });
    realtime.cambioHorario.set({ medicoAgendaId: 7, ts: 1 });
    await asentar();
    http.expectOne(r => r.url.endsWith('/agenda/medicos/7')).flush({ ...ficha('bbbbbbbbbbbbbbbb', []), sincronizacionHorario: origen });
    await asentar();
    expect(casilla('Lunes 09:00').getAttribute('aria-pressed')).toBe('false');
    expect(casilla('Lunes 09:00').disabled).toBe(true);
  });

  it('pinta la grilla con lo encendido y guarda EXACTAMENTE las casillas marcadas, con la versión leída', async () => {
    await montar('RECEPCION');
    expect(casilla('Lunes 09:00').getAttribute('aria-pressed')).toBe('true');
    expect(casilla('Martes 09:30').getAttribute('aria-pressed')).toBe('false');
    casilla('Lunes 09:00').click();
    casilla('Martes 09:30').click();
    await asentar();
    boton('Guardar horario')!.click();
    await asentar();
    const pedido = http.expectOne(r => r.url.endsWith('/agenda/medicos/7/horario'));
    expect(pedido.request.method).toBe('PUT');
    expect(pedido.request.body).toEqual({ version: 'aaaaaaaaaaaaaaaa', activas: [{ dia: 'Martes', hora: '09:30' }] });
    pedido.flush(ficha('bbbbbbbbbbbbbbbb', []));
    await asentar();
    expect(toast.success).toHaveBeenCalled();
    expect(boton('Guardar horario')).toBeUndefined();
  });

  it('si otra persona guardó antes (409), lo dice y ofrece ver lo último', async () => {
    await montar('ADMIN');
    casilla('Jueves 09:00').click();
    await asentar();
    boton('Guardar horario')!.click();
    await asentar();
    http.expectOne(r => r.url.endsWith('/horario')).flush({ codigo: 'CONFLICTO', message: 'Alguien cambió esta ficha' }, { status: 409, statusText: 'Conflict' });
    await asentar();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Otra persona cambió este médico');
  });

  it('con el mouse se pinta arrastrando: la primera casilla decide encender', async () => {
    await montar('RECEPCION');
    const raiz = fixture.nativeElement as HTMLElement;
    const evento = (tipo: string) => Object.assign(new Event(tipo, { bubbles: true }), { pointerType: 'mouse', button: 0 });
    casilla('Martes 09:00').dispatchEvent(evento('pointerdown'));
    casilla('Martes 09:30').dispatchEvent(evento('pointerenter'));
    document.dispatchEvent(evento('pointerup'));
    casilla('Miércoles 09:30').dispatchEvent(evento('pointerenter'));
    casilla('Martes 09:00').click(); // el click que cierra el arrastre no deshace lo pintado
    await asentar();
    expect(casilla('Martes 09:00').getAttribute('aria-pressed')).toBe('true');
    expect(casilla('Martes 09:30').getAttribute('aria-pressed')).toBe('true');
    expect(casilla('Miércoles 09:30').getAttribute('aria-pressed')).toBe('false');
    expect(raiz.textContent).toContain('1.5 h por semana');
  });

  it('copiar el lunes a lunes–viernes deja la semana igual', async () => {
    await montar('ADMIN');
    boton('a lunes–viernes')!.click();
    await asentar();
    for (const dia of ['Martes', 'Miércoles', 'Jueves', 'Viernes']) {
      expect(casilla(`${dia} 09:00`).getAttribute('aria-pressed')).toBe('true');
      expect(casilla(`${dia} 09:30`).getAttribute('aria-pressed')).toBe('false');
    }
    expect(casilla('Sábado 09:00').getAttribute('aria-pressed')).toBe('false');
  });

  it('la pestaña «WhatsApp» (el número con el que consulta su agenda) es solo de administración y no pide nada hasta abrirla', async () => {
    await montar('RECEPCION');
    expect((fixture.nativeElement as HTMLElement).querySelector('#ficha-tab-whatsapp')).toBeNull();
    expect((fixture.nativeElement as HTMLElement).querySelector('#ficha-panel-whatsapp')).toBeNull();
    fixture.destroy();
    TestBed.resetTestingModule();

    await montar('ADMIN');
    const raiz = fixture.nativeElement as HTMLElement;
    expect(raiz.querySelector('#ficha-tab-whatsapp')).not.toBeNull();
    /* Montada pero sin visitar: ni panel ni petición del teléfono (http.verify() del afterEach lo exige). */
    expect(raiz.querySelector('#ficha-panel-whatsapp')).toBeNull();
    raiz.querySelector<HTMLButtonElement>('#ficha-tab-whatsapp')!.click();
    await asentar();
    http.expectOne(r => r.url.endsWith('/agenda/medicos/7/whatsapp')).flush({ acceso: null });
    await asentar();
    expect(raiz.textContent).toContain('Sin número autorizado');
  });

  it('crear la ficha web la pide al médico y abre su presentación', async () => {
    await montar('RECEPCION');
    boton('Crear ficha web')!.click();
    await asentar();
    const pedido = http.expectOne(r => r.url.endsWith('/agenda/medicos/7/presentacion'));
    expect(pedido.request.method).toBe('POST');
    pedido.flush({ ...ficha('cccccccccccccccc'), presentacion: presentacionSinFoto });
    await asentar();
    http.expectOne(r => r.url.endsWith('/directorio/especialidades')).flush({ datos: [], total: 0, pagina: 1, limite: 100, totalPaginas: 1 });
    await asentar();
    const texto = (fixture.nativeElement as HTMLElement).textContent!;
    expect(texto).toContain('Así se verá en la web');
    expect(texto).toContain('obligatorio');
    // Sin especialidad web no se puede publicar.
    expect(boton('Publicar en la web')!.disabled).toBe(true);
  });

  it('asistencia la ve sin poder tocarla', async () => {
    await montar('ASISTENTE');
    expect(casilla('Lunes 09:00').disabled).toBe(true);
    expect(boton('Lunes')).toBeUndefined();
    expect(boton('a lunes–viernes')).toBeUndefined();
    expect(boton('Crear ficha web')).toBeUndefined();
    expect((fixture.nativeElement as HTMLElement).querySelector('input:not([disabled])')).toBeNull();
  });

  it('la cabecera muestra la foto de la agenda (la de la landing), completada con la base de la API', async () => {
    await montar('ASISTENTE', { ...ficha(), fotoUrl: '/publico/agenda/fotos/7/a1b2c3d4e5f60718', fotoOrigen: 'AGENDA' });
    const foto = (fixture.nativeElement as HTMLElement).querySelector<HTMLImageElement>('img[alt="Foto de Ana Sintética"]');
    expect(foto?.getAttribute('src')).toMatch(/^https?:\/\/[^/]+\/publico\/agenda\/fotos\/7\/a1b2c3d4e5f60718$/);
    expect(foto?.getAttribute('loading')).toBe('lazy');
  });

  it('una ficha web sin foto ofrece usar la de la agenda, y la pide al médico', async () => {
    await montar('RECEPCION', { ...ficha(), presentacion: presentacionSinFoto, fotoUrl: '/publico/agenda/fotos/7/a1b2c3d4e5f60718', fotoOrigen: 'AGENDA' });
    http.expectOne(r => r.url.endsWith('/directorio/especialidades')).flush({ datos: [], total: 0, pagina: 1, limite: 100, totalPaginas: 1 });
    await asentar();
    boton('Usar la de la agenda')!.click();
    await asentar();
    const pedido = http.expectOne(r => r.url.endsWith('/agenda/medicos/7/presentacion/foto/desde-agenda'));
    expect(pedido.request.method).toBe('POST');
    pedido.flush({ ...ficha(), presentacion: { ...presentacionSinFoto, fotoUrl: 'https://r2.example/foto.jpg' }, fotoUrl: 'https://r2.example/foto.jpg', fotoOrigen: 'WEB' });
    await asentar();
    /* La ficha web nueva vuelve a pedir sus especialidades, como tras cualquier guardado. */
    http.match(r => r.url.endsWith('/directorio/especialidades')).forEach(r => r.flush({ datos: [], total: 0, pagina: 1, limite: 100, totalPaginas: 1 }));
    await asentar();
    expect(toast.success).toHaveBeenCalled();
    expect(boton('Usar la de la agenda')).toBeUndefined();
  });

  it('la pestaña «Servicios» es de administración, pide su historial por el código al abrirla y enlaza al completo', async () => {
    await montar('RECEPCION');
    expect((fixture.nativeElement as HTMLElement).querySelector('#ficha-tab-servicios')).toBeNull();
    fixture.destroy();
    TestBed.resetTestingModule();

    await montar('ADMIN');
    const raiz = fixture.nativeElement as HTMLElement;
    expect(raiz.querySelector('#ficha-panel-servicios')).toBeNull();
    raiz.querySelector<HTMLButtonElement>('#ficha-tab-servicios')!.click();
    await asentar();
    http.expectOne(r => r.url.endsWith('/servicios/medicos/GIN-04')).flush({
      codigo: 'GIN-04', nombre: 'Dra. Ana Sintética',
      resumen: { servicios: 42, pacientes: 30, ingreso: 1200, ticketPromedio: 28.5, primeraAtencion: '2026-01-05', ultimaAtencion: '2026-09-30' },
      porModulo: [], porMes: [], topPacientes: [],
      topServicios: [{ etiqueta: 'Consulta ginecológica', total: 25, ingreso: 700 }],
    });
    await asentar();
    expect(raiz.textContent).toContain('Consulta ginecológica');
    expect(raiz.querySelector('a[href^="/servicios?medico=GIN-04"]')).not.toBeNull();
  });

  it('un médico sin servicios cargados no es un error', async () => {
    await montar('ADMIN');
    const raiz = fixture.nativeElement as HTMLElement;
    raiz.querySelector<HTMLButtonElement>('#ficha-tab-servicios')!.click();
    await asentar();
    http.expectOne(r => r.url.endsWith('/servicios/medicos/GIN-04')).flush({ message: 'No hay servicios' }, { status: 404, statusText: 'Not Found' });
    await asentar();
    expect(raiz.textContent).toContain('Sin servicios cargados');
    expect(raiz.textContent).not.toContain('Reintentar');
  });

  it('sin código de FileMaker no hay pestaña «Servicios»', async () => {
    const sinCodigo = ficha();
    await montar('ADMIN', { ...sinCodigo, medico: { ...sinCodigo.medico, codigo: null } });
    expect((fixture.nativeElement as HTMLElement).querySelector('#ficha-tab-servicios')).toBeNull();
  });
});
