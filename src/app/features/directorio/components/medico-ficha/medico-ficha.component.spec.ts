import '@angular/compiler';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { paginaVacia } from '../../../../core/api/pagination.model';
import { AuthService } from '../../../../core/auth/auth.service';
import { ToastService } from '../../../../core/toast/toast.service';
import { FichaMedico } from '../../directorio.model';
import { MedicoFichaComponent } from './medico-ficha.component';

const ficha: FichaMedico = {
  id: 'm1', nombrePublico: 'Dra. Rojas', slug: 'dra-rojas', resumen: '', biografia: '', matricula: null, precioConsulta: null,
  publicado: false, orden: 0, version: 2, medico: null, especialidades: [], resumenHorario: 'Con cita a solicitud',
  horario: [], ausencias: [], fotoUrl: null,
};

describe('ficha de un médico', () => {
  let fixture: ComponentFixture<MedicoFichaComponent>;
  let http: HttpTestingController;
  async function asentar() {
    for (let i = 0; i < 4; i++) { await Promise.resolve(); TestBed.tick(); }
  }
  async function abrir(admin: boolean) {
    TestBed.configureTestingModule({ providers: [
      provideHttpClient(), provideHttpClientTesting(),
      { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn() } },
      { provide: AuthService, useValue: { isAdmin: signal(admin) } },
    ] });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(MedicoFichaComponent);
    fixture.componentRef.setInput('id', 'm1');
    fixture.detectChanges();
    await asentar();
    http.expectOne(r => r.url.endsWith('/directorio/medicos/m1')).flush(ficha);
    http.expectOne(r => r.url.endsWith('/directorio/especialidades')).flush(paginaVacia());
    await asentar();
    fixture.detectChanges();
  }
  afterEach(() => { fixture?.destroy(); http.verify(); });

  it('el horario se guarda entero, con la versión, y un solape no se manda', async () => {
    await abrir(true);
    const c = fixture.componentInstance;
    c['agregarBloque']();
    c['agregarBloque']();
    c['editarBloque'](1, 'diaSemana', '1');
    c['editarBloque'](1, 'desde', '11:00');
    await asentar();
    expect(c['problemasHorario']().join(' ')).toMatch(/superponen/);
    await c['guardarHorario']();
    http.expectNone(r => r.method === 'PUT');

    c['editarBloque'](1, 'desde', '14:00');
    c['editarBloque'](1, 'hasta', '18:00');
    await asentar();
    const guardado = c['guardarHorario']();
    const pedido = http.expectOne(r => r.method === 'PUT' && r.url.endsWith('/directorio/medicos/m1/horario'));
    expect(pedido.request.body).toEqual({
      version: 2,
      bloques: [
        { diaSemana: 1, desde: '08:00', hasta: '12:00', lugar: null },
        { diaSemana: 1, desde: '14:00', hasta: '18:00', lugar: null },
      ],
    });
    pedido.flush({ ...ficha, version: 3, resumenHorario: 'Lunes, 08:00–12:00 y 14:00–18:00' });
    await guardado;
  });

  it('sin rango de administración se ve sin controles de edición', async () => {
    await abrir(false);
    const texto = fixture.nativeElement.textContent as string;
    expect(texto).not.toContain('Agregar bloque');
    expect(texto).not.toContain('Subir foto');
    expect(texto).not.toContain('Publicar');
    expect(fixture.nativeElement.querySelectorAll('input:disabled').length).toBeGreaterThan(2);
  });
});
