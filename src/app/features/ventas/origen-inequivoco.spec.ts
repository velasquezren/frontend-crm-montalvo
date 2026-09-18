import { describe, expect, it } from 'vitest';

import { origenInequivoco } from './origen-inequivoco';

/**
 * La regla que decide de qué lead viene una venta.
 *
 * Importa más de lo que su tamaño sugiere: `Venta.leadId` es el único enlace que
 * permite ir de una venta cobrada al anuncio de Meta que la originó
 * (`Venta → Lead → anuncioId`). Si se llena mal, el ROI de las campañas se
 * calcula sobre una mentira y nadie lo nota, porque una atribución equivocada se
 * ve exactamente igual que una correcta en un informe.
 *
 * Por eso lo único que se prueba acá es el límite: **cuándo NO elegir**.
 */
describe('origen de la venta: solo se preselecciona lo inequívoco', () => {
  it('1 · un único lead abierto → ese es el origen', () => {
    expect(origenInequivoco([{ id: 'lead-1' }])).toBe('lead-1');
  });

  it('2 · dos leads abiertos → no elige ninguno', () => {
    /* El caso real: 16 clientes de producción tienen dos leads. Quedarse con el
       más reciente sería inventar de qué campaña vino la venta. */
    expect(origenInequivoco([{ id: 'lead-1' }, { id: 'lead-2' }])).toBeNull();
  });

  it('3 · sin leads → NULL, y eso está bien', () => {
    /* Una venta sin lead es una venta legítima (mostrador, recomendación). NULL
       dice «no se sabe», que es información; un lead inventado no lo es. */
    expect(origenInequivoco([])).toBeNull();
  });

  it('4 · con muchos leads sigue sin elegir — no hay desempate por orden', () => {
    const muchos = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];
    expect(origenInequivoco(muchos)).toBeNull();
    /* Ni el primero ni el último: el orden de la lista no es evidencia de nada. */
    expect(origenInequivoco([...muchos].reverse())).toBeNull();
  });

  it('5 · no depende de nada más que del identificador', () => {
    /* La página le pasa leads completos. Si algún día alguien añade un desempate
       por fecha, estado o monto, este test es el que tiene que discutirlo. */
    const conRuido = [{ id: 'lead-9', origen: 'META_ADS', creadoEn: '2026-01-01' }];
    expect(origenInequivoco(conRuido)).toBe('lead-9');
  });
});
