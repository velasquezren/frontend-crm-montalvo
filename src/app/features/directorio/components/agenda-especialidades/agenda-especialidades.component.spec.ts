import '@angular/compiler';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AuthService } from '../../../../core/auth/auth.service';
import { RolUsuario } from '../../../../core/auth/user.model';
import { ToastService } from '../../../../core/toast/toast.service';
import { EspecialidadAgenda } from '../../agenda-medicos.model';
import { AgendaEspecialidadesComponent } from './agenda-especialidades.component';

const pagina = { id: '00000000-0000-4000-8000-000000000001', nombre: 'Ginecologia', slug: 'ginecologia', descripcion: '', activa: true, orden: 0, publicados: 2 };
const lista = (datos: EspecialidadAgenda[]) => ({ datos, total: datos.length, pagina: 1, limite: 100, totalPaginas: 1 });
const ESPECIALIDADES: EspecialidadAgenda[] = [
  { nombre: 'Ginecologia', medicos: 16, activos: 12, pagina },
  { nombre: 'Pediatria', medicos: 8, activos: 5, pagina: null },
  { nombre: 'Cardiologia', medicos: 10, activos: 7, pagina: null },
  { nombre: 'Oncologo', medicos: 1, activos: 0, pagina: null },
];

describe('pestaña Especialidades: las de la agenda, cada una con su página web', () => {
  let fixture: ComponentFixture<AgendaEspecialidadesComponent>;
  let http: HttpTestingController;
  async function asentar() {
    for (let i = 0; i < 4; i++) { await Promise.resolve(); TestBed.tick(); }
    fixture.detectChanges();
  }
  async function montar(rol: RolUsuario) {
    TestBed.configureTestingModule({ providers: [
      provideHttpClient(), provideHttpClientTesting(),
      { provide: ToastService, useValue: { error: vi.fn(), success: vi.fn() } },
      { provide: AuthService, useValue: { user: signal({ rol }), isAdmin: signal(false) } },
    ] });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(AgendaEspecialidadesComponent);
    fixture.detectChanges();
    await asentar();
    http.expectOne(r => r.url.endsWith('/agenda/medicos/especialidades')).flush(lista(ESPECIALIDADES));
    await asentar();
  }
  const texto = () => (fixture.nativeElement as HTMLElement).textContent!;
  const boton = (t: string) => Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button')).find(b => b.textContent?.includes(t));
  afterEach(() => { fixture?.destroy(); http.verify(); });

  it('muestra cuáles tienen página y crea de una vez las que faltan (solo con médicos activos)', async () => {
    await montar('RECEPCION');
    expect(texto()).toContain('Se muestra');
    expect(texto()).toContain('2 médicos publicados');
    expect(texto()).not.toContain('Oncologo'); // sin médicos activos: fuera del filtro por defecto
    boton('Mostrar las 2 que faltan en la web')!.click();
    await asentar();
    const pedido = http.expectOne(r => r.url.endsWith('/agenda/medicos/especialidades/paginas'));
    expect(pedido.request.body).toEqual({ nombres: ['Pediatria', 'Cardiologia'] });
    pedido.flush({ creadas: 2 });
    await asentar();
    http.expectOne(r => r.url.endsWith('/agenda/medicos/especialidades')).flush(lista(ESPECIALIDADES));
  });

  it('asistencia ve las páginas sin poder crearlas ni renombrar', async () => {
    await montar('ASISTENTE');
    expect(boton('que faltan en la web')).toBeUndefined();
    expect(boton('Mostrar en la web')).toBeUndefined();
    expect((fixture.nativeElement as HTMLElement).querySelector('button[aria-label^="Renombrar"]')).toBeNull();
  });
});
