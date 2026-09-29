import { describe, expect, it } from 'vitest';

import { silencioParaGuardar } from './linea-whatsapp.model';

/**
 * Qué líneas le suenan a una cuenta. La regla de fondo vive en el backend
 * (`LineasWhatsappService.audiencia`); aquí se fija lo que el formulario de
 * Agentes manda, que es donde se podía romper sin que el backend lo notara.
 */

const RECEPCION = 'linea-recepcion';
const VENTAS = 'linea-ventas';

describe('silencioParaGuardar', () => {
  it('manda el silencio de las líneas que sigue teniendo', () => {
    expect(silencioParaGuardar([RECEPCION], [VENTAS, RECEPCION])).toEqual([RECEPCION]);
  });

  /* El backend rechaza con 400 silenciar una línea que la cuenta no tiene. Si
     la admin quita Recepción, que estaba silenciada, el formulario no puede
     mandar ese silencio huérfano o no la deja guardar. */
  it('descarta el de una línea que la admin acaba de quitar', () => {
    expect(silencioParaGuardar([RECEPCION], [VENTAS])).toEqual([]);
  });
});
