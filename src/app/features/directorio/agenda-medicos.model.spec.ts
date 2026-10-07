import { describe, expect, it } from 'vitest';

import { puedeEditarAgendaClinica } from '../../core/auth/roles';
import { datosDeFormulario, formularioDe, MedicoAgenda, resumenDeCasillas } from './agenda-medicos.model';
import { tabDirectorioDe } from './directorio.page';

const medico: MedicoAgenda = {
  id: 7, codigo: 'GIN-04', nombre: 'Ana Sintética', sigla: 'Dra.', especialidad: 'Ginecologia', telefono: null, estado: 'ACTIVO',
  precio: '400.00', bancoId: 3, orden: 2, reservaEnLinea: true, casillasActivas: 4, fotoVersion: null,
};

describe('datos de un médico de la agenda', () => {
  it('el formulario de un médico se guarda tal cual: sin cambios no hay diferencias', () => {
    expect(datosDeFormulario(formularioDe(medico))).toEqual({
      datos: { nombre: 'Ana Sintética', sigla: 'Dra.', especialidad: 'Ginecologia', telefono: null, estado: 'ACTIVO', precio: '400.00', bancoId: 3, orden: 2 },
    });
  });

  it('acepta el precio con coma y vacío como «sin precio»; rechaza lo que la agenda no guarda', () => {
    const base = formularioDe(medico);
    expect(datosDeFormulario({ ...base, precio: '250,5' })).toMatchObject({ datos: { precio: '250.5' } });
    expect(datosDeFormulario({ ...base, precio: ' ' })).toMatchObject({ datos: { precio: null } });
    expect(datosDeFormulario({ ...base, precio: 'Bs 250' })).toHaveProperty('error');
    expect(datosDeFormulario({ ...base, sigla: 'Doctora' })).toHaveProperty('error');
    expect(datosDeFormulario({ ...base, nombre: '  ' })).toHaveProperty('error');
    expect(datosDeFormulario({ ...base, especialidad: '' })).toHaveProperty('error');
    expect(datosDeFormulario({ ...base, orden: '1.5' })).toHaveProperty('error');
  });
});

describe('resumen del horario', () => {
  const horas = ['09:00', '09:30', '10:00', '15:00'];
  it('cada día con su primera y última casilla; un día sin casillas no aparece', () => {
    const encendidas = new Set(['Lunes 09:00', 'Lunes 10:00', 'Miercoles 15:00']);
    expect(resumenDeCasillas(['Lunes', 'Martes', 'Miercoles'], horas, encendidas)).toBe('Lun 9:00–10:00 · Mié 15:00');
    expect(resumenDeCasillas(['Lunes'], horas, new Set())).toBe('');
  });
});

describe('permisos y pestañas del Directorio', () => {
  it('editan recepción y administración; asistencia y ventas no', () => {
    expect(puedeEditarAgendaClinica('RECEPCION')).toBe(true);
    expect(puedeEditarAgendaClinica('ADMIN')).toBe(true);
    expect(puedeEditarAgendaClinica('SUPER_ADMIN')).toBe(true);
    expect(puedeEditarAgendaClinica('ASISTENTE')).toBe(false);
    expect(puedeEditarAgendaClinica('AGENTE')).toBe(false);
    expect(puedeEditarAgendaClinica(undefined)).toBe(false);
  });

  it('quien no ve la agenda cae en las fichas web, aunque pida otra pestaña', () => {
    expect(tabDirectorioDe(null, true)).toBe('medicos');
    expect(tabDirectorioDe('especialidades', true)).toBe('especialidades');
    expect(tabDirectorioDe('medicos', false)).toBe('web');
    expect(tabDirectorioDe(null, false)).toBe('web');
  });
});
