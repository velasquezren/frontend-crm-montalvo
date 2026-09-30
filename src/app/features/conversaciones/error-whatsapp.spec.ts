import { describe, expect, it } from 'vitest';
import { explicacionErrorWhatsapp } from './error-whatsapp';

describe('explicaciones de rechazo de WhatsApp', () => {
  it('no atribuye el bloqueo por país a facturación ni recomienda una plantilla', () => {
    const explicacion = explicacionErrorWhatsapp(130497);
    expect(explicacion).toContain('país');
    expect(explicacion).not.toMatch(/pago|plantilla|24 horas/);
  });
  it('distingue facturación de una ventana cerrada', () => {
    expect(explicacionErrorWhatsapp(131042)).toContain('facturación');
    expect(explicacionErrorWhatsapp(131047)).toContain('plantilla aprobada');
  });
  it('las dos negativas de marketing dicen qué pasó y qué hacer, sin mandar a soporte', () => {
    expect(explicacionErrorWhatsapp(131050)).toContain('desactivó las promociones');
    expect(explicacionErrorWhatsapp(131049)).toContain('mañana');
    expect(explicacionErrorWhatsapp(131049)).not.toContain('administrador');
  });
  it('los mensajes históricos sin código tienen una explicación prudente', () => {
    expect(explicacionErrorWhatsapp()).toContain('consulta al administrador');
  });
});
