import { agruparPlanes, ultimoPrimero } from './agrupar-planes';
import { Objetivo, Vendedora, VentaImportada } from './planilla.model';

/**
 * Esta pantalla es donde administración decide qué plan cobra. Lo que marque
 * tiene que ser lo que la liquidación pague: son dos implementaciones de la
 * misma regla —`seleccionarPlanesComisionables()` en el backend y esta— y
 * cualquier diferencia entre ellas sale en dinero de una persona.
 *
 * Lo que se fija acá es sobre todo el borde que las separó: el motor solo mira
 * las filas COMISIONABLES, y esta pantalla las contaba todas.
 */

const VENDEDORA: Vendedora = {
  id: 'v1',
  codigo: 'Pe2455',
  nombre: 'Zuany',
  tipo: 'VENDEDORA',
  area: 'EJECUTIVA',
  sueldoBase: '0',
  activa: true,
  configurada: true,
  oculta: false,
  ocultaDesde: null,
  motivoOculta: null,
  /* El usuario del CRM que le corresponde, si lo tiene. No lo mira esta regla:
     el objetivo sale de `tipo`. */
  agente: null,
};

/** Objetivo de 4 paquetes y 1 plan varios, como diciembre 2025. */
const OBJETIVOS: Objetivo[] = [
  {
    id: 'o1',
    tipo: 'VENDEDORA',
    periodoId: null,
    planpaqMinimos: 4,
    planninMinimos: 1,
    montoMensualUsd: '12000',
    montoTrimestralUsd: '15000',
  },
];

/** Un plan con su correlativo; `comisionable` y `comisionaPlan` son lo que varía. */
function plan(
  correlativo: number,
  opciones: { comisionable?: boolean; comisionaPlan?: boolean | null } = {},
): VentaImportada {
  return {
    id: `p${correlativo}`,
    codOrigen: `VE${correlativo}`,
    fecha: '2025-12-10',
    modulo: 'MATERNIDAD',
    detalle: `Plan Nacer Cesárea ${correlativo}`,
    paciente: 'Paciente de prueba',
    vendedoraNombre: 'Zuany',
    captacion: 'FACEBOOK',
    /* `precio`/`ingresoNeto` viajan como TEXTO: son `Decimal` de Prisma y así
       se serializan a JSON. */
    precio: '3236.52',
    anticipoPlan: null,
    ingresoNeto: '2815.78',
    canal: 'EMPRESA',
    unidadNegocio: 'MATERNIDAD',
    clasif: 'PLANPAQ',
    tipo: 'A',
    nivel: 'BRONCE',
    comisionable: opciones.comisionable ?? true,
    motivoExclusion: null,
    requiereRevision: false,
    ajustadaManual: false,
    comisionaPlan: opciones.comisionaPlan ?? null,
    vendedora: { id: 'v1', nombre: 'Zuany', codigo: 'Pe2455' },
  };
}

function agrupar(planes: VentaImportada[]) {
  return agruparPlanes(planes, [], [VENDEDORA], OBJETIVOS);
}

describe('agruparPlanes · el objetivo es una franquicia', () => {
  it('con 6 vendidos y objetivo 4 comisionan 2', () => {
    const [grupo] = agrupar([plan(1), plan(2), plan(3), plan(4), plan(5), plan(6)]);

    expect(grupo.cupo).toBe(2);
    expect(grupo.elegidos?.size).toBe(2);
  });

  /* Igualar el objetivo paga cero: en diciembre de 2024 una vendedora hizo 4
     paquetes con objetivo 4 y no cobró Tipo A. */
  it('igualar el objetivo no comisiona nada', () => {
    const [grupo] = agrupar([plan(1), plan(2), plan(3), plan(4)]);

    expect(grupo.cupo).toBe(0);
    expect(grupo.elegidos?.size).toBe(0);
  });

  it('comisionan los ÚLTIMOS por correlativo, no los primeros', () => {
    const [grupo] = agrupar([plan(1), plan(2), plan(3), plan(4), plan(5), plan(6)]);

    expect([...(grupo.elegidos ?? [])].sort()).toEqual(['p5', 'p6']);
  });

  /* Como texto "VE999" iría después de "VE1000". Se compara el número. */
  it('el correlativo se compara como número al cruzar el millar', () => {
    const [grupo] = agruparPlanes(
      [plan(999), plan(1000), plan(1001), plan(1002), plan(1003)],
      [],
      [VENDEDORA],
      OBJETIVOS,
    );

    expect([...(grupo.elegidos ?? [])]).toEqual(['p1003']);
  });
});

describe('agruparPlanes · lo excluido no cuenta', () => {
  /*
   * EL CASO QUE SEPARABA LA PANTALLA DE LA PLANILLA.
   *
   * El motor arma sus candidatos con `comisionable: true`, así que con 5
   * paquetes de los que 1 está excluido y objetivo 4 le quedan 4 candidatos y
   * el cupo es 0: no paga nada. La pantalla los contaba los 5, calculaba cupo 1
   * y marcaba un plan como «comisiona».
   */
  it('una fila excluida no infla el cupo', () => {
    const [grupo] = agrupar([
      plan(1),
      plan(2),
      plan(3),
      plan(4),
      plan(5, { comisionable: false }),
    ]);

    expect(grupo.planes).toHaveLength(4);
    expect(grupo.cupo).toBe(0);
    expect(grupo.elegidos?.size).toBe(0);
  });

  it('una fila excluida nunca se marca como que comisiona', () => {
    const [grupo] = agrupar([
      plan(1),
      plan(2),
      plan(3),
      plan(4),
      plan(5),
      plan(6, { comisionable: false }),
    ]);

    expect(grupo.elegidos?.has('p6')).toBe(false);
    expect([...(grupo.elegidos ?? [])]).toEqual(['p5']);
  });

  /* No se tiran en silencio: se cuentan para poder decir cuántas faltan. Es la
     misma regla que obliga al consolidado a nombrar a las vendedoras ocultas. */
  it('se declaran cuántas quedaron fuera', () => {
    const [grupo] = agrupar([plan(1), plan(2, { comisionable: false }), plan(3, { comisionable: false })]);

    expect(grupo.excluidos).toBe(2);
    expect(grupo.planes).toHaveLength(1);
  });
});

describe('agruparPlanes · la decisión manual manda', () => {
  it('lo marcado a mano ocupa el cupo antes que lo automático', () => {
    const [grupo] = agrupar([
      plan(1, { comisionaPlan: true }),
      plan(2),
      plan(3),
      plan(4),
      plan(5),
      plan(6),
    ]);

    /* p1 es el más viejo: sin la marca no entraría nunca. Con ella ocupa uno de
       los dos huecos y el otro se completa con el más reciente. */
    expect([...(grupo.elegidos ?? [])].sort()).toEqual(['p1', 'p6']);
  });

  /* Descartar el último a mano NO reduce el cupo: el hueco lo ocupa el
     siguiente hacia abajo. Son dos cosas distintas —cuántos comisionan y
     cuáles— y confundirlas le quitaría a la vendedora un plan entero. */
  it('el hueco de lo descartado a mano lo ocupa el siguiente', () => {
    const [grupo] = agrupar([
      plan(1),
      plan(2),
      plan(3),
      plan(4),
      plan(5),
      plan(6, { comisionaPlan: false }),
    ]);

    expect(grupo.cupo).toBe(2);
    expect(grupo.elegidos?.has('p6')).toBe(false);
    expect([...(grupo.elegidos ?? [])].sort()).toEqual(['p4', 'p5']);
  });
});

describe('ultimoPrimero', () => {
  /* En diciembre 2025 la venta VE1458 es del 22/12 y la VE1462, posterior por
     correlativo, del 13/12. La planilla siempre siguió el correlativo. */
  it('el correlativo gana a la fecha cuando se contradicen', () => {
    const vieja = { ...plan(1462), fecha: '2025-12-13' };
    const nueva = { ...plan(1458), fecha: '2025-12-22' };

    expect([nueva, vieja].sort(ultimoPrimero).map(p => p.id)).toEqual(['p1462', 'p1458']);
  });

  it('sin correlativo desempata la fecha', () => {
    const a = { ...plan(1), codOrigen: null, fecha: '2025-12-01' };
    const b = { ...plan(2), codOrigen: null, fecha: '2025-12-20' };

    expect([a, b].sort(ultimoPrimero).map(p => p.id)).toEqual(['p2', 'p1']);
  });
});
