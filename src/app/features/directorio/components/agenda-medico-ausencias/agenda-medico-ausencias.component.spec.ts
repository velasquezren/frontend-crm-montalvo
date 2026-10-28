import '@angular/compiler';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ToastService } from '../../../../core/toast/toast.service';
import { AusenciaAgenda, textoPendientes } from '../../agenda-medicos.model';
import { AgendaMedicoAusenciasComponent } from './agenda-medico-ausencias.component';

const VACACIONES: AusenciaAgenda = { id: 'a1', desde: '2099-11-10', hasta: '2099-11-21', motivo: 'Vacaciones', pendientes: { citas: 3, reservas: 1 } };

describe('vacaciones y ausencias del médico', () => {
  let fixture: ComponentFixture<AgendaMedicoAusenciasComponent>;
  let http: HttpTestingController;
  const toast = { error: vi.fn(), success: vi.fn() };
  async function asentar() {
    for (let i = 0; i < 4; i++) { await Promise.resolve(); TestBed.tick(); }
    fixture.detectChanges();
  }
  function montar(ausencias: AusenciaAgenda[], editable = true) {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), { provide: ToastService, useValue: toast }] });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(AgendaMedicoAusenciasComponent);
    fixture.componentRef.setInput('id', 7);
    fixture.componentRef.setInput('nombre', 'Dr. Sintético');
    fixture.componentRef.setInput('ausencias', ausencias);
    fixture.componentRef.setInput('editable', editable);
    fixture.detectChanges();
  }
  const raiz = () => fixture.nativeElement as HTMLElement;
  const texto = () => raiz().textContent ?? '';
  const boton = (t: string) => Array.from(raiz().querySelectorAll('button')).find(b => b.textContent?.includes(t));
  const fechas = () => Array.from(raiz().querySelectorAll<HTMLInputElement>('input[type="date"]'));
  async function escribir(campo: HTMLInputElement, valor: string) {
    campo.value = valor;
    campo.dispatchEvent(new Event('input', { bubbles: true }));
    await asentar();
  }
  afterEach(() => { fixture?.destroy(); http.verify(); vi.clearAllMocks(); });

  it('cada ausencia dice cuántas citas hay que reprogramar en FileMaker', () => {
    montar([VACACIONES, { ...VACACIONES, id: 'a2', pendientes: { citas: 0, reservas: 0 } }, { ...VACACIONES, id: 'a3', pendientes: null }]);
    expect(texto()).toContain('Ya tiene 3 citas y 1 reserva esos días');
    expect(texto()).toContain('Sin citas agendadas esos días');
    expect(texto()).toContain('No se pudo revisar si tiene citas');
  });

  it('sin ausencias lo dice; quien no edita no ve el formulario ni el botón de quitar', () => {
    montar([], false);
    expect(texto()).toContain('no tiene vacaciones ni ausencias cargadas');
    expect(fechas()).toHaveLength(0);
    fixture.componentRef.setInput('ausencias', [VACACIONES]);
    fixture.detectChanges();
    expect(texto()).toContain('Vacaciones');
    expect(raiz().querySelector('button')).toBeNull();
  });

  it('no deja guardar un rango al revés; uno válido se manda y la lista viene del servidor', async () => {
    montar([]);
    const cambiadas = vi.fn();
    fixture.componentInstance.cambiadas.subscribe(cambiadas);
    const [desde, hasta] = fechas();
    await escribir(desde, '2099-11-21');
    await escribir(hasta, '2099-11-10');
    expect(texto()).toContain('El último día es anterior al primero');
    expect(boton('Guardar ausencia')!.disabled).toBe(true);

    await escribir(desde, '2099-11-10');
    await escribir(hasta, '2099-11-21');
    boton('Guardar ausencia')!.click();
    await asentar();
    const pedido = http.expectOne(r => r.url.endsWith('/agenda/medicos/7/ausencias'));
    expect(pedido.request.method).toBe('POST');
    expect(pedido.request.body).toEqual({ desde: '2099-11-10', hasta: '2099-11-21', motivoPublico: 'Vacaciones' });
    pedido.flush({ ausencias: [VACACIONES] });
    await asentar();
    expect(cambiadas).toHaveBeenCalledWith([VACACIONES]);
    expect(texto()).toContain('Ya tiene 3 citas y 1 reserva');
    expect(fechas()[0].value).toBe('');
  });

  it('quitar dice de qué fechas es y deja la lista que devuelve el servidor', async () => {
    montar([VACACIONES]);
    const quitar = raiz().querySelector<HTMLButtonElement>('button[aria-label^="Quitar la ausencia del"]')!;
    expect(quitar.getAttribute('aria-label')).toMatch(/Quitar la ausencia del .*2099 al .*2099/);
    quitar.click();
    await asentar();
    const pedido = http.expectOne(r => r.url.endsWith('/agenda/medicos/7/ausencias/a1'));
    expect(pedido.request.method).toBe('DELETE');
    pedido.flush({ ausencias: [] });
    await asentar();
    expect(texto()).toContain('no tiene vacaciones ni ausencias cargadas');
  });

  it('el plural de lo pendiente', () => {
    expect(textoPendientes({ citas: 1, reservas: 0 })).toBe('1 cita');
    expect(textoPendientes({ citas: 0, reservas: 2 })).toBe('2 reservas');
    expect(textoPendientes({ citas: 0, reservas: 0 })).toBeNull();
  });
});
