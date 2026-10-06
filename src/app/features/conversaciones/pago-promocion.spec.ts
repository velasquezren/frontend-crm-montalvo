import { describe, expect, it } from 'vitest';
import { avisoDeAccionPago, PagoDelChat } from './pago-promocion';

const pago: PagoDelChat = {
  id: 'p1', estado: 'CONFIRMADO', monto: 280, ventaId: 'v1',
  promocion: { id: 'pr1', titulo: 'Consulta', codigo: 'PRM-TEST1' },
  comprobanteMensajeId: 'm1', motivoRechazo: null, cerradoPor: null,
  cerradoEn: null, createdAt: '2026-10-06T12:00:00Z',
};

describe('resultado del pago y del aviso a la paciente', () => {
  it('un aviso fallido requiere atención aunque la venta se haya guardado', () => {
    const aviso = avisoDeAccionPago('confirmar', { ...pago, avisoPaciente: 'NO_ENVIADO' });
    expect(aviso.advertencia).toBe(true);
    expect(aviso.texto).toContain('se registró la venta');
    expect(aviso.texto).toContain('No se pudo enviar');
  });
  it('pedir otro también advierte si no se pudo escribirle', () => {
    expect(avisoDeAccionPago('pedir-otro', { ...pago, avisoPaciente: 'NO_ENVIADO' }).advertencia).toBe(true);
  });
  it('un mensaje preparado no se presenta como entregado', () => {
    const aviso = avisoDeAccionPago('confirmar', { ...pago, avisoPaciente: 'ENCOLADO' });
    expect(aviso.advertencia).toBe(false);
    expect(aviso.texto).toContain('consulta su entrega');
    expect(aviso.texto).not.toContain('se le avisó');
  });
  it('una respuesta antigua o repetida no inventa un envío', () => {
    expect(avisoDeAccionPago('confirmar', pago).texto).toBe('Pago confirmado: se registró la venta.');
    expect(avisoDeAccionPago('anular', null).texto).toBe('Pago anulado.');
  });
});
