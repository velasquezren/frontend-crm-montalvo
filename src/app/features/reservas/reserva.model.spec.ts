import { describe, expect, it } from 'vitest';

import { cubreRol, puedeVerAgendaClinica } from '../../core/auth/roles';
import { RolUsuario } from '../../core/auth/user.model';
import { NAV_GROUPS } from '../../shared/components/layout/nav-items';
import { estadoDeReserva, fechaDeReserva, precioEnBs, rangoDePeriodo } from './reserva.model';

describe('periodos de la pantalla Reservas, en el calendario de La Paz', () => {
  /* 03:30 UTC del 7 de octubre = 23:30 del 6 en Bolivia: «hoy» sigue siendo el 6. */
  const casiMedianoche = new Date('2026-10-07T03:30:00Z');

  it('hoy, próximos 7 y 30 días (hoy incluido) y los últimos 30', () => {
    expect(rangoDePeriodo('hoy', casiMedianoche)).toEqual({ desde: '2026-10-06', hasta: '2026-10-06' });
    expect(rangoDePeriodo('semana', casiMedianoche)).toEqual({ desde: '2026-10-06', hasta: '2026-10-12' });
    expect(rangoDePeriodo('mes', casiMedianoche)).toEqual({ desde: '2026-10-06', hasta: '2026-11-04' });
    expect(rangoDePeriodo('pasados', casiMedianoche)).toEqual({ desde: '2026-09-07', hasta: '2026-10-06' });
  });

  it('cruza el fin de año sin perder días', () => {
    expect(rangoDePeriodo('semana', new Date('2026-12-28T15:00:00Z'))).toEqual({ desde: '2026-12-28', hasta: '2027-01-03' });
  });
});

describe('cómo se lee una reserva', () => {
  it('la fecha lleva el día de la semana; una fecha rota se muestra tal cual', () => {
    expect(fechaDeReserva('2026-10-13')).toBe('mar 13 oct');
    expect(fechaDeReserva('2026-10-18')).toBe('dom 18 oct');
    expect(fechaDeReserva('no-es-fecha')).toBe('no-es-fecha');
    expect(fechaDeReserva('')).toBe('—');
  });

  it('PAGADO es «por verificar», no «pagada»; un estado nuevo se muestra sin inventarle significado', () => {
    expect(estadoDeReserva('PAGADO')).toEqual({ etiqueta: 'Pago por verificar', variante: 'info' });
    expect(estadoDeReserva('ANULADO')).toEqual({ etiqueta: 'ANULADO', variante: 'neutral' });
    expect(estadoDeReserva('')).toEqual({ etiqueta: 'Sin estado', variante: 'neutral' });
  });

  it('el precio llega en centavos y se muestra en Bs; sin precio, nada', () => {
    expect(precioEnBs({ importeCentavos: 40025, moneda: 'BOB' })).toBe(400.25);
    expect(precioEnBs(null)).toBeNull();
  });
});

/* La tabla entera, como en Resultados: el rango no sirve aquí. Recepción y asistencia
   están por debajo de una agente de ventas y son quienes gestionan las citas. Si alguien
   «simplifica» el ítem a un `rolMinimo`, esto cae. */
describe('quién ve Reservas en el menú', () => {
  const item = NAV_GROUPS.flatMap(g => g.items).find(i => i.path === '/reservas');
  const ve = (rol: RolUsuario) => (item!.rolMinimo !== undefined && cubreRol(rol, item!.rolMinimo)) || item!.roles?.includes(rol) === true;

  it.each<[RolUsuario, boolean]>([
    ['RECEPCION', true],
    ['ASISTENTE', true],
    ['AGENTE', false],
    ['ADMIN', true],
    ['SUPER_ADMIN', true],
  ])('%s → %s (y la misma respuesta que el guard)', (rol, esperado) => {
    expect(ve(rol)).toBe(esperado);
    expect(puedeVerAgendaClinica(rol)).toBe(esperado);
  });
});
