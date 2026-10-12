import { describe, expect, it } from 'vitest';

import { borradorDe, cambiosDe, PromocionDetalle, rangoVigencia, serviciosDeFilas } from './promocion.model';

const promo: PromocionDetalle = {
  id: 'p1', codigo: 'PRM-7K3QX', slug: 'control-7k3qx', titulo: 'Control prenatal', resumen: 'Tres controles',
  descripcion: '', condiciones: 'Incluye tres controles.', etiquetaOferta: '-20 %', precioRegular: 600, precioPromocional: 480,
  vigenteDesde: '2026-10-01', vigenteHasta: '2026-10-31', vigencia: 'VIGENTE', estado: 'BORRADOR', destacada: false,
  enLanding: true, enWhatsapp: true, especialidad: { id: 'e1', nombre: 'Ginecología', slug: 'ginecologia' }, medicos: [],
  imagenes: [], anuncios: [], creadaPor: null, revisadaPor: null, publicadaEn: null, motivoDevolucion: null, version: 3,
  createdAt: '', updatedAt: '', mensajeWhatsapp: '', faltantes: [], puedeEditar: true, acciones: ['enviar'],
  resultados: { leads: 0, ventasGanadas: 0, montoVendido: 0 }, servicios: [],
};

/** Como «Octubre Rosa»: sin precio propio, cada servicio con el suyo. */
const rosa: PromocionDetalle = {
  ...promo, precioRegular: null, precioPromocional: null, etiquetaOferta: null,
  servicios: [
    { id: 's1', nombre: 'Ecografía Mamaria', precioRegular: 446, precioPromocional: 268 },
    { id: 's2', nombre: 'Consulta Ginecológica', precioRegular: 250, precioPromocional: 175 },
  ],
};

describe('los servicios de la promoción en el editor', () => {
  it('sin tocarlos no viajan; reordenar, editar o agregar manda la lista entera con los ids que siguen', () => {
    expect(cambiosDe(rosa, borradorDe(rosa))).toEqual({ cambios: {} });
    const b = borradorDe(rosa);
    const editado = { ...b, servicios: [b.servicios[1], { ...b.servicios[0], precioPromocional: '250,50' }, { clave: 'n1', nombre: ' Cultivo Vaginal ', precioRegular: '170', precioPromocional: '120' }] };
    expect(cambiosDe(rosa, editado)).toEqual({ cambios: { servicios: [
      { id: 's2', nombre: 'Consulta Ginecológica', precioRegular: 250, precioPromocional: 175 },
      { id: 's1', nombre: 'Ecografía Mamaria', precioRegular: 446, precioPromocional: 250.5 },
      { nombre: 'Cultivo Vaginal', precioRegular: 170, precioPromocional: 120 },
    ] } });
  });

  it('las mismas reglas que el servidor, dichas antes de guardar', () => {
    const fila = (nombre: string, regular: string, promo: string) => ({ clave: nombre, nombre, precioRegular: regular, precioPromocional: promo });
    expect(serviciosDeFilas([fila('Eco', '100', '100')])).toEqual({ error: expect.stringMatching(/menor que el de siempre/) });
    expect(serviciosDeFilas([fila('Eco', '', '')])).toEqual({ error: expect.stringMatching(/precio de promoción/) });
    expect(serviciosDeFilas([fila('Eco', '', '90'), fila('eco', '', '80')])).toEqual({ error: expect.stringMatching(/dos veces/) });
    expect(serviciosDeFilas([fila(' ', '', '90')])).toEqual({ error: expect.stringMatching(/nombre/) });
    expect(serviciosDeFilas([fila('Eco', 'Bs 100', '90')])).toEqual({ error: expect.stringMatching(/solo con números/) });
    expect(serviciosDeFilas(Array.from({ length: 11 }, (_, i) => fila(`S${i}`, '', '10')))).toEqual({ error: expect.stringMatching(/como mucho 10/) });
    /* El de siempre es opcional. */
    expect(serviciosDeFilas([fila('Eco', '', '90')])).toEqual({ servicios: [{ nombre: 'Eco', precioRegular: null, precioPromocional: 90 }] });
  });

  it('con servicios, el precio de la promoción tiene que quedar vacío', () => {
    expect(cambiosDe(rosa, { ...borradorDe(rosa), precioPromocional: '200' })).toEqual({ error: expect.stringMatching(/el precio va en cada servicio/) });
  });
});

describe('cambiosDe: solo viaja lo que se tocó', () => {
  it('sin tocar nada, no hay cambios', () => {
    expect(cambiosDe(promo, borradorDe(promo))).toEqual({ cambios: {} });
  });

  it('un campo tocado viaja solo él; vaciar un opcional lo manda como null', () => {
    const b = { ...borradorDe(promo), titulo: '  Control prenatal completo ', etiquetaOferta: '', vigenteHasta: '', especialidadId: '' };
    expect(cambiosDe(promo, b)).toEqual({
      cambios: { titulo: 'Control prenatal completo', etiquetaOferta: null, vigenteHasta: null, especialidadId: null },
    });
  });

  it('precios: con coma, vacíos o inválidos', () => {
    expect(cambiosDe(promo, { ...borradorDe(promo), precioPromocional: '450,50' })).toEqual({ cambios: { precioPromocional: 450.5 } });
    expect(cambiosDe(promo, { ...borradorDe(promo), precioRegular: '', precioPromocional: '' })).toEqual({ cambios: { precioRegular: null, precioPromocional: null } });
    expect(cambiosDe(promo, { ...borradorDe(promo), precioPromocional: 'Bs 450' })).toEqual({ error: expect.stringMatching(/solo con números/) });
    expect(cambiosDe(promo, { ...borradorDe(promo), precioPromocional: '700' })).toEqual({ error: expect.stringMatching(/menor que el regular/) });
  });

  it('vigencia al revés y título vacío no se mandan', () => {
    expect(cambiosDe(promo, { ...borradorDe(promo), vigenteHasta: '2026-09-01' })).toEqual({ error: expect.stringMatching(/termina antes/) });
    expect(cambiosDe(promo, { ...borradorDe(promo), titulo: '   ' })).toEqual({ error: expect.stringMatching(/no pueden quedar vacíos/) });
  });

  it('el rango de vigencia se lee en castellano', () => {
    expect(rangoVigencia('2026-10-01', '2026-10-31')).toBe('Del 1 oct 2026 al 31 oct 2026');
    expect(rangoVigencia('2026-10-01', null)).toBe('Desde el 1 oct 2026, sin fecha de fin');
  });
});
