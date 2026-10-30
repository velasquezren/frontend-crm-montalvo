import '@angular/compiler';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RealtimeService } from '../../core/realtime/realtime.service';
import { ToastService } from '../../core/toast/toast.service';
import { colaVacia, EntregaResultado } from './resultado.model';
import { ResultadosPage } from './resultados.page';

const base: EntregaResultado = {
  informeId: 'informe-prueba', estudio: 'Estudio de prueba', fechaEstudio: '2026-10-01',
  publicadoEn: '2026-10-01T12:00:00Z', accesoVigente: true,
  paciente: { id: 'paciente-prueba', nombre: 'Paciente de prueba', telefono: '+59170000001' },
  pacientePortal: { nombre: 'Paciente de prueba', pac: 'PAC-PRUEBA', ci: null },
  vinculo: 'PAC', sinFicha: null, aviso: null, abiertoEn: null, conversacionId: null,
};

describe('Resultados: corregir teléfono no es reenviar', () => {
  let fixture: ComponentFixture<ResultadosPage>;
  let http: HttpTestingController;
  const toast = { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() };
  const listado = (fila: EntregaResultado) => ({ ...colaVacia(), datos: [fila], total: 1 });

  async function asentar() {
    for (let i = 0; i < 4; i++) { await Promise.resolve(); TestBed.tick(); }
    fixture.detectChanges();
  }

  async function montar(fila: EntregaResultado) {
    TestBed.configureTestingModule({ providers: [
      provideHttpClient(), provideHttpClientTesting(), provideRouter([]),
      { provide: RealtimeService, useValue: { actividad: signal(null) } },
      { provide: ToastService, useValue: toast },
    ] });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(ResultadosPage);
    await asentar();
    http.expectOne(r => r.url.endsWith('/resultados/pendientes')).flush(listado(fila));
    await asentar();
  }

  const boton = (raiz: ParentNode, texto: string) => Array.from(raiz.querySelectorAll('button'))
    .find(b => b.textContent?.trim() === texto)!;

  afterEach(() => { fixture?.destroy(); http?.verify(); vi.clearAllMocks(); });

  it.each(['ENVIADO', 'ENTREGADO', 'LEIDO', 'INCIERTO', null] as const)(
    'el aviso %s conserva corregir teléfono, pero no ofrece otro envío', async estadoMensaje => {
      await montar({ ...base, aviso: { enviadoEn: '2026-10-01T12:00:00Z', estadoMensaje } });
      const vista: HTMLElement = fixture.nativeElement;
      expect(boton(vista, 'Corregir teléfono')).toBeDefined();
      expect(boton(vista, 'Enviar aviso')).toBeUndefined();
      expect(boton(vista, 'Reintentar aviso')).toBeUndefined();
    },
  );

  it('corregir un teléfono ya avisado hace solo PATCH y conserva la entrega anterior', async () => {
    const fila: EntregaResultado = { ...base, aviso: { enviadoEn: '2026-10-01T12:00:00Z', estadoMensaje: 'ENTREGADO' } };
    await montar(fila);
    boton(fixture.nativeElement, 'Corregir teléfono').click();
    await asentar();
    const modal = document.querySelector<HTMLElement>('[role="dialog"]')!;
    expect(modal.textContent).toContain('no retira ese mensaje ni revoca su enlace');
    const campo = modal.querySelector<HTMLInputElement>('input[type="tel"]')!;
    campo.value = '70000002';
    campo.dispatchEvent(new Event('input'));
    await asentar();
    boton(modal, 'Guardar sin enviar').click();
    await asentar();
    const patch = http.expectOne(r => r.url.endsWith('/resultados/informe-prueba/telefono'));
    expect(patch.request.method).toBe('PATCH');
    expect(patch.request.body).toEqual({ telefono: '+59170000002' });
    patch.flush({ clienteId: 'paciente-prueba', telefono: '+59170000002' });
    await asentar();
    http.expectOne(r => r.url.endsWith('/resultados/pendientes')).flush(listado({
      ...fila, paciente: { ...fila.paciente!, telefono: '+59170000002' },
    }));
    await asentar();
    http.expectNone(r => r.method === 'POST');
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(toast.success).toHaveBeenCalledWith(expect.stringContaining('No se envió ningún mensaje'), 'Teléfono actualizado');
    expect(boton(fixture.nativeElement, 'Reintentar aviso')).toBeUndefined();
  });

  it('el fallo ofrece reintentar y explica la causa antes de enviar', async () => {
    await montar({ ...base, aviso: { enviadoEn: '2026-10-01T12:00:00Z', estadoMensaje: 'FALLIDO', codigoErrorEnvio: 131026 } });
    boton(fixture.nativeElement, 'Reintentar aviso').click();
    await asentar();
    const modal = document.querySelector<HTMLElement>('[role="dialog"]')!;
    expect(modal.textContent).toContain('este error no confirma');
    expect(modal.textContent).toContain('+59170000001');
    boton(modal, 'Cancelar').click();
    await asentar();
    http.expectNone(r => r.method === 'POST');
  });

  it('no ofrece renovar y enviar cuando el paciente ya abrió el informe', async () => {
    await montar({ ...base, accesoVigente: false, abiertoEn: '2026-10-02T12:00:00Z' });
    expect(boton(fixture.nativeElement, 'Renovar y enviar')).toBeUndefined();
    expect(fixture.nativeElement.textContent).toContain('Informe ya abierto');
  });
});
