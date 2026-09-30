import { describe, expect, it } from 'vitest';

import { cambiosDeFicha, valoresDeFicha, ValoresFicha } from './ficha-paciente';

const vacia: ValoresFicha = {
  nombre: 'Ana Pérez',
  email: '',
  pac: '',
  ci: '',
  empresa: '',
  fechaNacimiento: '',
  lugarNacimiento: '',
  categoria: 'PROSPECTO',
  notas: '',
  etiquetas: '',
};

describe('valoresDeFicha', () => {
  it('prefiere las columnas y cae al JSON de FileMaker solo si faltan', () => {
    const conColumnas = valoresDeFicha({
      nombre: 'Ana',
      empresaTrabajo: 'Clínica',
      fechaNacimiento: '1990-05-04T00:00:00.000Z',
      ciLugar: 'SCZ',
      datosExtra: { empresa: 'Vieja', fn: '1980-01-01', 'CI.Lug.Pac': 'LPZ' },
    });
    expect(conColumnas).toMatchObject({ empresa: 'Clínica', fechaNacimiento: '1990-05-04', lugarNacimiento: 'SCZ' });

    const soloFileMaker = valoresDeFicha({ nombre: 'Ana', datosExtra: { fn: '1980-01-01', 'CI.Lug.Pac': 'LPZ' } });
    expect(soloFileMaker).toMatchObject({ fechaNacimiento: '1980-01-01', lugarNacimiento: 'LPZ' });
  });

  it('edita solo las etiquetas guardadas, no los intereses', () => {
    const v = valoresDeFicha({ nombre: 'Ana', datosExtra: { tags: ['vip', 'cirugía'] } });
    expect(v.etiquetas).toBe('vip, cirugía');
  });
});

describe('cambiosDeFicha', () => {
  it('un campo vaciado se manda para borrarse, no se omite', () => {
    const cambios = cambiosDeFicha(vacia);
    expect(cambios.empresa).toBe('');
    expect(cambios.lugarNacimiento).toBe('');
    expect(cambios.fechaNacimiento).toBeNull();
    expect(cambios.email).toBeNull();
    expect(cambios.pac).toBeNull();
  });

  it('en una edición anula las copias viejas del JSON para que no reaparezcan', () => {
    expect(cambiosDeFicha(vacia).datosExtra).toMatchObject({
      empresa: null,
      lugarNacimiento: null,
      fechaNacimiento: null,
    });
  });

  it('en un alta omite la fecha vacía y no escribe claves de más en el JSON', () => {
    const cambios = cambiosDeFicha(vacia, { alta: true });
    expect(cambios.fechaNacimiento).toBeUndefined();
    expect(cambios.datosExtra).toEqual({ notas: null, tags: [] });
  });

  it('normaliza PAC, recorta y separa etiquetas', () => {
    const cambios = cambiosDeFicha({ ...vacia, pac: ' pac-12 ', etiquetas: 'vip, , cirugía ' });
    expect(cambios.pac).toBe('PAC-12');
    expect(cambios.datosExtra?.['tags']).toEqual(['vip', 'cirugía']);
  });
});
