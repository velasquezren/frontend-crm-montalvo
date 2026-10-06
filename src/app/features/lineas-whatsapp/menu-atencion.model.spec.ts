import { describe, expect, it } from 'vitest';

import { MenuAtencion, menuInicial, paraGuardar, tiposDisponibles, vistaPrevia } from './menu-atencion.model';

const base = (): MenuAtencion => ({
  activo: true,
  saludo: 'Hola',
  opciones: [
    { tipo: 'PERSONA', titulo: 'Hablar con persona' },
    { tipo: 'CITA', titulo: 'Pedir cita' },
  ],
});

describe('modelo del menú de atención', () => {
  it('un menú nuevo trae la salida a una persona y ningún texto inventado', () => {
    const m = menuInicial();
    expect(m.activo).toBe(false);
    expect(m.saludo).toBe('');
    expect(m.opciones.map(o => o.tipo)).toEqual(['PERSONA']);
    expect(m.opciones[0].respuesta).toBeUndefined();
  });

  it('los tipos únicos no se ofrecen dos veces; la información sí', () => {
    const disponibles = tiposDisponibles(base());
    expect(disponibles).not.toContain('PERSONA');
    expect(disponibles).not.toContain('CITA');
    expect(disponibles).toContain('RESPUESTA');
    const conInfo = { ...base(), opciones: [...base().opciones, { tipo: 'RESPUESTA' as const, titulo: 'Horarios' }] };
    expect(tiposDisponibles(conInfo)).toContain('RESPUESTA');
  });

  it('con diez opciones ya no se puede agregar otra', () => {
    const lleno = { ...base(), opciones: Array.from({ length: 10 }, (_, i) => ({ tipo: 'RESPUESTA' as const, titulo: `Info ${i}` })) };
    expect(tiposDisponibles(lleno)).toEqual([]);
  });

  it('lo que viaja al servidor va sin espacios sobrantes ni campos vacíos', () => {
    const m = base();
    m.saludo = '  Hola  ';
    m.opciones[0] = { tipo: 'PERSONA', titulo: ' Hablar ', descripcion: '   ', respuesta: ' Te escribimos ' };
    expect(paraGuardar(m)).toEqual({
      activo: true,
      saludo: 'Hola',
      opciones: [{ tipo: 'PERSONA', titulo: 'Hablar', respuesta: 'Te escribimos' }, { tipo: 'CITA', titulo: 'Pedir cita' }],
    });
  });

  it('la vista previa sigue la regla del servidor: botones si caben, lista si no', () => {
    expect(vistaPrevia(base()).tipo).toBe('botones');
    const largo = base();
    largo.opciones[0].titulo = 'Hablar con una persona';
    expect(vistaPrevia(largo).tipo).toBe('lista');
    const conDescripcion = base();
    conDescripcion.opciones[1].descripcion = 'Te escribimos para acordar';
    expect(vistaPrevia(conDescripcion).tipo).toBe('lista');
    const cuatro = { ...base(), opciones: [...base().opciones, { tipo: 'UBICACION' as const, titulo: 'Ubicación' }, { tipo: 'RESPUESTA' as const, titulo: 'Horarios' }] };
    expect(vistaPrevia(cuatro).tipo).toBe('lista');
  });
});
