import '@angular/compiler';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ToastService } from '../../../../core/toast/toast.service';
import { AccesoWhatsappMedico } from '../../agenda-medicos.model';
import { AgendaMedicoWhatsappComponent } from './agenda-medico-whatsapp.component';

const ACCESO: AccesoWhatsappMedico = {
  agendaMedicoId: 7, telefono: '+59170012345', nombreMedico: 'Dra. Ana Sintética', autorizadoPor: 'Persona admin', autorizadoEn: '2026-10-10T15:00:00.000Z',
};

describe('número de WhatsApp del médico', () => {
  let fixture: ComponentFixture<AgendaMedicoWhatsappComponent>;
  let http: HttpTestingController;
  const toast = { error: vi.fn(), success: vi.fn() };
  async function asentar() {
    for (let i = 0; i < 4; i++) { await Promise.resolve(); TestBed.tick(); }
    fixture.detectChanges();
  }
  async function montar(respuesta: { acceso: AccesoWhatsappMedico | null } | { status: number }, activo = true) {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), { provide: ToastService, useValue: toast }] });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(AgendaMedicoWhatsappComponent);
    fixture.componentRef.setInput('id', 7);
    fixture.componentRef.setInput('nombre', 'Dra. Ana Sintética');
    fixture.componentRef.setInput('activo', activo);
    fixture.detectChanges();
    await asentar();
    const pedido = http.expectOne(r => r.url.endsWith('/agenda/medicos/7/whatsapp'));
    if ('status' in respuesta) pedido.flush({ message: 'caído' }, { status: respuesta.status, statusText: 'Error' });
    else pedido.flush(respuesta);
    await asentar();
  }
  const texto = () => (fixture.nativeElement as HTMLElement).textContent ?? '';
  const boton = (t: string) => Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button')).find(b => b.textContent?.includes(t));
  const campo = () => (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>('input')!;
  async function escribir(valor: string) {
    campo().value = valor;
    campo().dispatchEvent(new Event('input', { bubbles: true }));
    await asentar();
  }
  afterEach(() => { fixture?.destroy(); http.verify(); vi.clearAllMocks(); });

  it('sin número autorizado lo dice, no inventa uno y ofrece autorizar', async () => {
    await montar({ acceso: null });
    expect(texto()).toContain('Sin número autorizado');
    expect(texto()).toContain('Autorizar este número');
    expect(boton('Quitar acceso')).toBeUndefined();
  });

  it('un número que no parece teléfono avisa y no deja guardar; uno válido muestra cómo se guardará', async () => {
    await montar({ acceso: null });
    await escribir('abc');
    expect(texto()).toContain('Escribe un celular de 8 dígitos');
    expect(boton('Autorizar este número')!.disabled).toBe(true);
    await escribir('70012345');
    expect(texto()).toContain('Se guardará como +59170012345');
    expect(boton('Autorizar este número')!.disabled).toBe(false);
  });

  it('autoriza con el número normalizado (E.164) y pasa a mostrar quién autorizó', async () => {
    await montar({ acceso: null });
    await escribir('700 12345');
    boton('Autorizar este número')!.click();
    await asentar();
    const pedido = http.expectOne(r => r.url.endsWith('/agenda/medicos/7/whatsapp'));
    expect(pedido.request.method).toBe('PUT');
    expect(pedido.request.body).toEqual({ telefono: '+59170012345' });
    pedido.flush(ACCESO);
    await asentar();
    expect(toast.success).toHaveBeenCalled();
    expect(texto()).toContain('Consulta su agenda por WhatsApp');
    expect(texto()).toContain('+59170012345');
    expect(texto()).toContain('Persona admin');
    expect(campo().value).toBe('');
  });

  it('un número ya autorizado a otro médico (409) se avisa con el motivo del servidor y no cambia nada', async () => {
    await montar({ acceso: null });
    await escribir('70012345');
    boton('Autorizar este número')!.click();
    await asentar();
    http.expectOne(r => r.method === 'PUT').flush({ message: 'Ese número ya está autorizado para Dr. Peña. Quítaselo primero.' }, { status: 409, statusText: 'Conflict' });
    await asentar();
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('Dr. Peña'), 'Error');
    expect(texto()).toContain('Sin número autorizado');
  });

  it('con número: muestra el estado, no deja «cambiar» al mismo número y pide confirmar antes de quitar', async () => {
    await montar({ acceso: ACCESO });
    expect(texto()).toContain('Autorizado');
    await escribir('+591 70012345');
    expect(texto()).toContain('Es el número que ya está autorizado.');
    expect(boton('Cambiar número')!.disabled).toBe(true);
    boton('Quitar acceso')!.click();
    await asentar();
    /* Todavía no se pidió nada: falta confirmar. */
    http.expectNone(r => r.method === 'DELETE');
    expect(texto()).toContain('dejará de ver la agenda');
    boton('Sí, quitar acceso')!.click();
    await asentar();
    const pedido = http.expectOne(r => r.method === 'DELETE' && r.url.endsWith('/agenda/medicos/7/whatsapp'));
    pedido.flush({ ok: true });
    await asentar();
    expect(texto()).toContain('Sin número autorizado');
    expect(toast.success).toHaveBeenCalled();
  });

  it('un médico inactivo no recibe acceso nuevo', async () => {
    await montar({ acceso: null }, false);
    expect(texto()).toContain('no está activo');
    expect(boton('Autorizar este número')).toBeUndefined();
  });

  it('si la lectura falla, dice que falló (no «sin número») y ofrece reintentar', async () => {
    await montar({ status: 503 });
    expect(texto()).not.toContain('Sin número autorizado');
    expect(boton('Reintentar')).toBeDefined();
  });
});
