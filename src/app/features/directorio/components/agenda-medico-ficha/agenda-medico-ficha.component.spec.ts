import '@angular/compiler';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AuthService } from '../../../../core/auth/auth.service';
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
});

describe('ficha de un médico de la agenda', () => {
  let fixture: ComponentFixture<AgendaMedicoFichaComponent>;
  let http: HttpTestingController;
  const toast = { error: vi.fn(), success: vi.fn() };
  async function asentar() {
    for (let i = 0; i < 4; i++) { await Promise.resolve(); TestBed.tick(); }
    fixture.detectChanges();
  }
  async function montar(rol: RolUsuario) {
    TestBed.configureTestingModule({ providers: [
      provideHttpClient(), provideHttpClientTesting(),
      { provide: ToastService, useValue: toast },
      { provide: AuthService, useValue: { user: signal({ rol }), isAdmin: signal(false) } },
    ] });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(AgendaMedicoFichaComponent);
    fixture.componentRef.setInput('id', 7);
    fixture.detectChanges();
    await asentar();
    http.expectOne(r => r.url.endsWith('/agenda/medicos/7')).flush(ficha());
    await asentar();
  }
  const casilla = (etiqueta: string) =>
    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(`button[aria-label="${etiqueta}"]`)!;
  const boton = (texto: string) =>
    Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button')).find(b => b.textContent?.includes(texto));
  afterEach(() => { fixture?.destroy(); http.verify(); vi.clearAllMocks(); });

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

  it('asistencia la ve sin poder tocarla', async () => {
    await montar('ASISTENTE');
    expect(casilla('Lunes 09:00').disabled).toBe(true);
    expect(boton('Lunes')).toBeUndefined();
    expect((fixture.nativeElement as HTMLElement).querySelector('input:not([disabled])')).toBeNull();
  });
});
