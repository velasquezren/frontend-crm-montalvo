import { etiquetaDeAccion, ICONO_VERIFICACION, RESULTADO_LECTURA } from './asistente-chat';

describe('asistente en el chat', () => {
  it('cada acción dice qué manda y de quién', () => {
    expect(etiquetaDeAccion({ tipo: 'PROMOCION', titulo: 'Control prenatal', promocionId: 'p' })).toBe('Enviar tarjeta: Control prenatal');
    expect(etiquetaDeAccion({ tipo: 'HORARIO', titulo: 'Dra. Rojas', medicoId: 7 })).toBe('Enviar horario: Dra. Rojas');
  });

  it('la lectura nunca dice «pagado» ni «confirmado»: eso lo hace una persona', () => {
    for (const r of Object.values(RESULTADO_LECTURA)) expect(r.texto).not.toMatch(/pagad|confirmad/i);
  });

  it('cada estado de verificación tiene su propia forma, no solo un color', () => {
    expect(new Set(Object.values(ICONO_VERIFICACION)).size).toBe(3);
  });
});
