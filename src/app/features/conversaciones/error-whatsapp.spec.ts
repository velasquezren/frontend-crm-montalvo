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
  it('los mensajes históricos sin código tienen una explicación prudente', () => {
    expect(explicacionErrorWhatsapp()).toContain('consulta al administrador');
  });
});
