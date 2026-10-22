import '@angular/compiler';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ToastService } from '../../../core/toast/toast.service';
import { AvisosCaja } from './avisos-caja.model';
import { AvisosCajaComponent } from './avisos-caja.component';

const BASE: AvisosCaja = {
  numeros: [],
  plantilla: { nombre: 'montalvo_comprobante_caja', estado: 'NO_EXISTE', cuerpo: 'Comprobante nuevo\n\nPaciente: {{1}}\nMonto: {{5}}', pie: 'Clínica Montalvo · aviso automático del CRM' },
  linea: 'Recepción Clínica Montalvo',
  maximo: 10,
};
const NUMERO = { id: 'n-1', nombre: 'Caja central', telefono: '+59170000001', agregadoPor: 'Persona admin', agregadoEn: '2026-10-22T15:00:00.000Z' };

describe('avisos a caja', () => {
  let fixture: ComponentFixture<AvisosCajaComponent>;
  let http: HttpTestingController;
  const toast = { error: vi.fn(), success: vi.fn() };
  async function asentar() {
    for (let i = 0; i < 4; i++) { await Promise.resolve(); TestBed.tick(); }
    fixture.detectChanges();
  }
  async function montar(respuesta: AvisosCaja) {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), { provide: ToastService, useValue: toast }] });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(AvisosCajaComponent);
    fixture.detectChanges();
    await asentar();
    http.expectOne(r => r.url.endsWith('/agenda/avisos-caja')).flush(respuesta);
    await asentar();
  }
  const el = () => fixture.nativeElement as HTMLElement;
  const texto = () => el().textContent ?? '';
  const boton = (t: string) => Array.from(el().querySelectorAll('button')).find(b => b.textContent?.includes(t));
  async function escribir(indice: number, valor: string) {
    const campo = el().querySelectorAll<HTMLInputElement>('input')[indice];
    campo.value = valor;
    campo.dispatchEvent(new Event('input', { bubbles: true }));
    await asentar();
  }
  afterEach(() => { fixture?.destroy(); http.verify(); vi.clearAllMocks(); });

  it('dice por qué todavía no salen avisos y muestra el mensaje con datos de ejemplo, no con {{1}}', async () => {
    await montar(BASE);
    expect(texto()).toContain('Falta la plantilla');
    expect(texto()).toContain('Todavía no hay números');
    expect(texto()).toContain('Paciente: Ana Pérez');
    expect(texto()).toContain('Monto: Bs 400');
    expect(texto()).not.toContain('{{');
  });

  it('agrega un número con su nombre y muestra lo que respondió el servidor', async () => {
    await montar(BASE);
    expect(boton('Agregar número')!.disabled).toBe(true);
    await escribir(0, 'Caja central');
    await escribir(1, '70000001');
    expect(texto()).toContain('Se guardará como +59170000001');
    boton('Agregar número')!.click();
    await asentar();
    const pedido = http.expectOne(r => r.method === 'POST' && r.url.endsWith('/agenda/avisos-caja'));
    expect(pedido.request.body).toEqual({ nombre: 'Caja central', telefono: '+59170000001' });
    pedido.flush({ ...BASE, plantilla: { ...BASE.plantilla, estado: 'APROBADA' }, numeros: [NUMERO] });
    await asentar();
    expect(texto()).toContain('Caja central');
    expect(texto()).toContain('Activos');
    expect(toast.success).toHaveBeenCalled();
  });

  it('quitar pide confirmación y el botón dice de qué número es', async () => {
    await montar({ ...BASE, numeros: [NUMERO] });
    const quitar = el().querySelector<HTMLButtonElement>('button[aria-label="Quitar el número de Caja central"]');
    expect(quitar).not.toBeNull();
    quitar!.click();
    await asentar();
    expect(texto()).toContain('dejará de recibir los avisos');
    boton('Sí, quitar')!.click();
    await asentar();
    http.expectOne(r => r.method === 'DELETE' && r.url.endsWith('/agenda/avisos-caja/n-1')).flush(BASE);
    await asentar();
    expect(texto()).toContain('Todavía no hay números');
  });

  it('con el máximo de números no ofrece agregar otro', async () => {
    await montar({ ...BASE, maximo: 1, numeros: [NUMERO] });
    expect(boton('Agregar número')).toBeUndefined();
    expect(texto()).toContain('Llegaste al máximo');
  });
});
