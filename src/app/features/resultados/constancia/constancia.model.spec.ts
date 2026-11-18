import { describe, expect, it } from 'vitest';

import { estadoWhatsapp, EntregaWhatsapp, FilaConstancia, mesAnterior, mesDeUrl, mesesParaElegir, nombreDelMes, resumenConstancia } from './constancia.model';

/**
 * Lo que la constancia DICE de cada aviso sale de aquí. En un documento que se
 * notaria no se supone: «enviado» sin confirmación no es «no llegó», y un
 * aviso sin mensaje dice que no hay registro.
 */
const whatsapp = (w: Partial<EntregaWhatsapp>): EntregaWhatsapp => ({
  estado: 'ENVIADO', enviadoEn: '2026-11-03T14:00:00.000Z', entregadoEn: null, leidoEn: null, codigoError: null, ...w,
});

const fila = (f: Partial<FilaConstancia>): FilaConstancia => ({
  avisoId: 'a', enviadoEn: '2026-11-03T14:00:00.000Z', enviadoPor: { nombre: 'Asistente', usuarioFilemaker: null },
  destinatario: { nombre: 'Paciente', telefono: '+59170000001', telefonoAlEnviar: true, otraFicha: false },
  informeId: 'i', estudio: 'Ecografía', informe: null, whatsapp: whatsapp({}), portal: null, pdfPorWhatsapp: [], ...f,
});

describe('estado de WhatsApp en la constancia', () => {
  it('dice lo que consta, del más fuerte al más débil', () => {
    expect(estadoWhatsapp(whatsapp({ estado: 'LEIDO', entregadoEn: 'x', leidoEn: 'y' }))).toBe('Leído');
    /* El «leído» llegó sin el «entregado»: igual consta que lo leyó. */
    expect(estadoWhatsapp(whatsapp({ estado: 'LEIDO' }))).toBe('Leído');
    expect(estadoWhatsapp(whatsapp({ estado: 'ENTREGADO', entregadoEn: 'x' }))).toBe('Entregado');
    expect(estadoWhatsapp(whatsapp({}))).toBe('Enviado, sin confirmación de entrega');
    expect(estadoWhatsapp(whatsapp({ estado: 'INCIERTO' }))).toBe('Envío sin confirmar');
    expect(estadoWhatsapp(whatsapp({ estado: 'FALLIDO', codigoError: 131026 }))).toBe('No entregado (WhatsApp, código 131026)');
    expect(estadoWhatsapp(null)).toBe('Sin registro del mensaje');
  });
});

describe('resumen del mes', () => {
  it('cuenta entregados, leídos, no entregados, abiertos y PDF pedidos', () => {
    const r = resumenConstancia([
      fila({ whatsapp: whatsapp({ estado: 'LEIDO', entregadoEn: 'x', leidoEn: 'y' }), portal: { primera: 'z', pdf: null, original: null, adjuntos: null } }),
      fila({ whatsapp: whatsapp({ estado: 'ENTREGADO', entregadoEn: 'x' }), pdfPorWhatsapp: [{ solicitadoEn: 'p', envio: null }] }),
      fila({ whatsapp: whatsapp({ estado: 'FALLIDO' }) }),
      fila({ whatsapp: null, portal: { primera: null, pdf: null, original: null, adjuntos: null } }),
    ]);
    expect(r).toEqual({ avisos: 4, entregados: 2, leidos: 1, noEntregados: 1, abiertos: 1, pdfPedidos: 1 });
  });
});

describe('el mes de la constancia', () => {
  it('lo que no es un mes en la URL vale el de por defecto', () => {
    expect(mesDeUrl('2026-10', '2026-11')).toBe('2026-10');
    for (const malo of [null, '', '2026-13', '2026-1', 'octubre', '2026-10-01']) expect(mesDeUrl(malo, '2026-11')).toBe('2026-11');
  });

  it('el anterior cruza el año y los nombres van en castellano', () => {
    expect(mesAnterior('2026-01')).toBe('2025-12');
    expect(mesAnterior('2026-11')).toBe('2026-10');
    expect(nombreDelMes('2026-08')).toBe('Agosto de 2026');
  });

  it('ofrece los últimos doce meses, el actual marcado en curso', () => {
    const meses = mesesParaElegir('2026-02');
    expect(meses).toHaveLength(12);
    expect(meses[0]).toEqual({ valor: '2026-02', etiqueta: 'Febrero de 2026 (en curso)' });
    expect(meses[2]).toEqual({ valor: '2025-12', etiqueta: 'Diciembre de 2025' });
    expect(meses[11].valor).toBe('2025-03');
  });
});
