import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AccionPago, PagoDelChat } from '../../pago-promocion';
import { ConversacionesStateService } from '../../services/conversaciones-state.service';
import { PagoPromocionComponent } from './pago-promocion.component';

const BASE: PagoDelChat = {
  id: 'pago-1', estado: 'COMPROBANTE_ENVIADO', monto: 280,
  promocion: { id: 'p1', titulo: 'Control prenatal', codigo: 'PRM-7K3QX' },
  comprobanteMensajeId: 'm-comprobante', motivoRechazo: null, ventaId: null,
  cerradoPor: null, cerradoEn: null, createdAt: '2026-10-06T12:00:00.000Z',
};

describe('bloque de pago de una promoción en el chat', () => {
  const accionPago = vi.fn<(pagoId: string, accion: AccionPago, motivo?: string) => Promise<boolean>>(async () => true);
  const comercial = signal(true);
  const detalle = signal({ mensajes: [{ id: 'm-comprobante', tipo: 'IMAGEN', mediaUrl: 'https://r2.invalid/c.jpg', mediaNombre: 'c.jpg' }] });

  beforeEach(() => {
    accionPago.mockClear();
    comercial.set(true);
    TestBed.configureTestingModule({
      providers: [{ provide: ConversacionesStateService, useValue: {
        accionPago, cambiandoPago: signal<AccionPago | null>(null), puedeGestionComercial: comercial, detalleActual: detalle,
      } }],
    });
  });
  afterEach(() => vi.restoreAllMocks());

  async function montar(pago: PagoDelChat | null, promocion: { id: string; titulo: string; codigo: string } | null = null) {
    const f = TestBed.createComponent(PagoPromocionComponent);
    f.componentRef.setInput('conversacionId', 'c1');
    f.componentRef.setInput('pago', pago);
    f.componentRef.setInput('promocion', promocion);
    await f.whenStable();
    return { f, el: f.nativeElement as HTMLElement };
  }
  const boton = (el: HTMLElement, texto: string) => [...el.querySelectorAll('button')].find(b => (b.textContent ?? '').includes(texto) || b.getAttribute('aria-label')?.includes(texto));

  it('con comprobante por verificar: monto, promoción, el comprobante y «Confirmar pago»', async () => {
    const { el } = await montar(BASE);
    expect(el.textContent).toContain('Control prenatal');
    expect(el.textContent).toContain('Comprobante por verificar');
    expect(el.querySelector('a[href="https://r2.invalid/c.jpg"]')).not.toBeNull();
    boton(el, 'Confirmar pago')!.click();
    expect(accionPago).toHaveBeenCalledWith('pago-1', 'confirmar');
  });

  it('quien no registra ventas no ve «Confirmar pago»; sí puede pedir otro', async () => {
    comercial.set(false);
    const { el } = await montar(BASE);
    expect(boton(el, 'Confirmar pago')).toBeUndefined();
    expect(boton(el, 'Pedir otro')).toBeDefined();
  });

  it('pedir otro exige un motivo, que es lo que leerá la paciente', async () => {
    const { f, el } = await montar(BASE);
    boton(el, 'Pedir otro')!.click();
    f.detectChanges();
    const form = el.querySelector('form[aria-label="Pedir otro comprobante"]') as HTMLFormElement;
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    f.detectChanges();
    expect(accionPago).not.toHaveBeenCalled();
    expect(el.textContent).toContain('Escribe el motivo');
    const input = form.querySelector('input') as HTMLInputElement;
    input.value = 'el monto no coincide';
    input.dispatchEvent(new Event('input'));
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    expect(accionPago).toHaveBeenCalledWith('pago-1', 'pedir-otro', 'el monto no coincide');
  });

  it('anular pregunta antes; sin confirmar, no hace nada', async () => {
    const confirmar = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const { el } = await montar(BASE);
    boton(el, 'Anular el pago')!.click();
    expect(confirmar).toHaveBeenCalled();
    expect(accionPago).not.toHaveBeenCalled();
    confirmar.mockReturnValue(true);
    boton(el, 'Anular el pago')!.click();
    expect(accionPago).toHaveBeenCalledWith('pago-1', 'anular');
  });

  it('pendiente: dice qué falta (o el motivo del pedido anterior) y no ofrece confirmar', async () => {
    const { el } = await montar({ ...BASE, estado: 'PENDIENTE', comprobanteMensajeId: null, motivoRechazo: 'la foto no se lee' });
    expect(el.textContent).toContain('Esperando comprobante');
    expect(el.textContent).toContain('la foto no se lee');
    expect(boton(el, 'Confirmar pago')).toBeUndefined();
  });

  it('confirmado: quién lo confirmó y que la venta quedó registrada, sin acciones', async () => {
    const { el } = await montar({ ...BASE, estado: 'CONFIRMADO', ventaId: 'v1', cerradoPor: { id: 'u1', nombre: 'Ana Pérez' } });
    expect(el.textContent).toContain('Pago confirmado');
    expect(el.textContent).toContain('Confirmado por Ana');
    expect(el.querySelectorAll('button')).toHaveLength(0);
  });

  it('sin pago, si llegó por el código de una promoción, una línea lo dice', async () => {
    const { el } = await montar(null, { id: 'p1', titulo: 'Control prenatal', codigo: 'PRM-7K3QX' });
    expect(el.textContent).toContain('Llegó por la promoción «Control prenatal» (PRM-7K3QX)');
  });
});
