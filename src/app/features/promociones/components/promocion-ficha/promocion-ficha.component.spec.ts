import '@angular/compiler';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { paginaVacia } from '../../../../core/api/pagination.model';
import { ToastService } from '../../../../core/toast/toast.service';
import { PromocionDetalle } from '../../promocion.model';
import { PromocionFichaComponent } from './promocion-ficha.component';

const base: PromocionDetalle = {
  id: 'p1', codigo: 'PRM-7K3QX', slug: 'control-7k3qx', titulo: 'Control prenatal', resumen: 'Tres controles',
  descripcion: '', condiciones: 'Incluye tres controles.', etiquetaOferta: null, precioRegular: 600, precioPromocional: 480,
  vigenteDesde: '2026-10-01', vigenteHasta: '2026-10-31', vigencia: 'VIGENTE', estado: 'BORRADOR', destacada: false,
  enLanding: true, enWhatsapp: true, especialidad: null, medicos: [], imagenes: [], anuncios: [], creadaPor: null,
  revisadaPor: null, publicadaEn: null, motivoDevolucion: null, version: 4, createdAt: '', updatedAt: '',
  mensajeWhatsapp: 'Hola, me interesa la promoción «Control prenatal» (PRM-7K3QX).',
  faltantes: ['Falta el banner Cuadrado 1:1.'], puedeEditar: true, acciones: ['enviar'],
  resultados: { leads: 0, ventasGanadas: 0, montoVendido: 0 },
};

describe('ficha de una promoción', () => {
  let fixture: ComponentFixture<PromocionFichaComponent>;
  let http: HttpTestingController;
  const toast = { success: vi.fn(), error: vi.fn() };
  async function asentar() {
    for (let i = 0; i < 4; i++) { await Promise.resolve(); TestBed.tick(); }
  }
  async function abrir(p: PromocionDetalle) {
    fixture = TestBed.createComponent(PromocionFichaComponent);
    fixture.componentRef.setInput('id', p.id);
    fixture.detectChanges();
    await asentar();
    http.expectOne(r => r.url.endsWith('/promociones/p1')).flush(p);
    for (const r of http.match(r => r.url.includes('/directorio/'))) r.flush(paginaVacia());
    await asentar();
    fixture.detectChanges();
  }
  const botones = () => [...fixture.nativeElement.querySelectorAll('button')] as HTMLButtonElement[];
  const boton = (texto: string) => botones().find(b => b.textContent?.trim() === texto);

  beforeEach(() => {
    toast.success.mockReset();
    toast.error.mockReset();
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]), { provide: ToastService, useValue: toast }] });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => { fixture?.destroy(); http.verify(); });

  it('dice qué falta y no deja enviar a revisión hasta completarla', async () => {
    await abrir(base);
    expect(fixture.nativeElement.textContent).toContain('Falta el banner Cuadrado 1:1.');
    expect(boton('Enviar a revisión')?.disabled).toBe(true);
    expect(boton('Publicar')).toBeUndefined();
  });

  it('las acciones son las que dice el servidor: completa, se puede enviar', async () => {
    await abrir({ ...base, faltantes: [], acciones: ['enviar'] });
    expect(boton('Enviar a revisión')?.disabled).toBe(false);
  });

  it('guardar manda SOLO lo que cambió, con la versión leída', async () => {
    await abrir(base);
    fixture.componentInstance['editar']('titulo', 'Control prenatal completo');
    await asentar();
    fixture.detectChanges();
    const guardado = fixture.componentInstance['guardar']();
    const pedido = http.expectOne(r => r.method === 'PATCH' && r.url.endsWith('/promociones/p1'));
    expect(pedido.request.body).toEqual({ titulo: 'Control prenatal completo', version: 4 });
    pedido.flush({ ...base, titulo: 'Control prenatal completo', version: 5 });
    await guardado;
    await asentar();
    expect(toast.success).toHaveBeenCalled();
    expect(fixture.componentInstance['hayCambios']()).toBe(false);
  });

  it('si otra persona guardó (409), ofrece recargar en vez de pisarla', async () => {
    await abrir(base);
    fixture.componentInstance['editar']('resumen', 'Otra cosa');
    await asentar();
    const guardado = fixture.componentInstance['guardar']();
    http.expectOne(r => r.method === 'PATCH').flush({ message: 'Otra persona guardó cambios en esta promoción.' }, { status: 409, statusText: 'Conflict' });
    await guardado;
    await asentar();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Recargar y perder los míos');
    expect(fixture.componentInstance['hayCambios']()).toBe(true);
  });

  it('en revisión, sin permiso de edición: campos bloqueados y sin «Guardar»', async () => {
    await abrir({ ...base, estado: 'EN_REVISION', puedeEditar: false, acciones: [] });
    expect(fixture.nativeElement.querySelectorAll('input:disabled').length).toBeGreaterThan(3);
    expect(boton('Guardar')).toBeUndefined();
    expect(fixture.nativeElement.textContent).toContain('solo la edita un administrador');
  });
});
