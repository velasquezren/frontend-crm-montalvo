import { describe, expect, it } from 'vitest';

import { sinFormato, textoVistaPrevia } from './vista-previa';

describe('vista previa del último mensaje', () => {
  it('quita el formato de WhatsApp en vez de enseñar los asteriscos', () => {
    expect(sinFormato('*Hola* _María_, tu cita es ~mañana~ `10:00`')).toBe('Hola María, tu cita es mañana 10:00');
  });

  it('no toca asteriscos que no son formato', () => {
    expect(sinFormato('2*3 = 6')).toBe('2*3 = 6');
  });

  it('deja una sola línea', () => {
    expect(sinFormato('hola\n\n  qué tal')).toBe('hola qué tal');
  });

  it('nombra la media por su tipo y conserva el pie de foto', () => {
    expect(textoVistaPrevia({ tipo: 'IMAGEN', contenido: 'mi receta', mediaNombre: null })).toBe('Foto · mi receta');
    expect(textoVistaPrevia({ tipo: 'AUDIO', contenido: '', mediaNombre: null })).toBe('Mensaje de voz');
    expect(textoVistaPrevia({ tipo: 'DOCUMENTO', contenido: '', mediaNombre: 'analisis.pdf' })).toBe('analisis.pdf');
  });

  it('sin mensaje, nada', () => {
    expect(textoVistaPrevia(undefined)).toBe('');
  });
});
