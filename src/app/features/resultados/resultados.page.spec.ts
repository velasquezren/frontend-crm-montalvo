import { describe, expect, it } from 'vitest';

import { cubreRol } from '../../core/auth/roles';
import { RolUsuario } from '../../core/auth/user.model';
import { NAV_GROUPS } from '../../shared/components/layout/nav-items';
import { EntregaResultado, estadoEntrega, sePuedeEntregar } from './resultado.model';

/**
 * La parte de esta pantalla que decide algo, aislada de Angular: cuándo se
 * puede avisar a un paciente y quién ve la entrada del menú.
 *
 * La segunda importa más de lo que parece: el rango NO sirve aquí. `ASISTENTE`
 * comparte rango con recepción y está por debajo de un agente de ventas, que no
 * debe entregar informes médicos. Si alguien "simplifica" el ítem a un
 * `rolMinimo`, esto cae.
 */

const base: EntregaResultado = {
  informeId: 'i-1',
  estudio: 'Ecografía abdominal',
  fechaEstudio: '2026-09-20',
  publicadoEn: '2026-09-21T10:00:00.000Z',
  accesoVigente: true,
  paciente: { id: 'c-1', nombre: 'Paciente', telefono: '+59170000001' },
  aviso: null,
};

describe('cuándo se puede entregar un resultado', () => {
  it('se puede con paciente vinculado, acceso vivo y sin aviso previo', () => {
    expect(sePuedeEntregar(base)).toBe(true);
  });

  it('no se puede si el paciente no está en el CRM', () => {
    expect(sePuedeEntregar({ ...base, paciente: null })).toBe(false);
  });

  it('no se puede con el acceso vencido: sería mandarlo a una puerta cerrada', () => {
    expect(sePuedeEntregar({ ...base, accesoVigente: false })).toBe(false);
  });

  it('no se puede dos veces: WhatsApp cuesta y el paciente ya lo recibió', () => {
    expect(sePuedeEntregar({ ...base, aviso: { enviadoEn: '2026-09-22T12:00:00.000Z', estadoMensaje: 'ENVIADO' } })).toBe(false);
  });

  /* Meta rechaza en diferido: el aviso quedó guardado pero el paciente no recibió nada. */
  it('se puede reenviar si Meta lo rechazó, y la fila no lo pinta como entregado', () => {
    const fallido = { ...base, aviso: { enviadoEn: '2026-09-22T12:00:00.000Z', estadoMensaje: 'FALLIDO' as const } };
    expect(sePuedeEntregar(fallido)).toBe(true);
    expect(estadoEntrega(fallido).variant).toBe('critical');
  });

  it('NO se reenvía si no se sabe si llegó: sería el doble WhatsApp', () => {
    const incierto = { ...base, aviso: { enviadoEn: '2026-09-22T12:00:00.000Z', estadoMensaje: 'INCIERTO' as const } };
    expect(sePuedeEntregar(incierto)).toBe(false);
    expect(estadoEntrega(incierto).texto).toBe('Sin confirmar');
  });
});

describe('quién ve la entrega de resultados en el menú', () => {
  const item = NAV_GROUPS.flatMap(grupo => grupo.items).find(i => i.path === '/resultados');

  const ve = (rol: RolUsuario): boolean =>
    (item!.rolMinimo !== undefined && cubreRol(rol, item!.rolMinimo)) ||
    item!.roles?.includes(rol) === true;

  it('el ítem existe y no se apoya solo en el rango', () => {
    expect(item).toBeDefined();
    expect(item!.roles).toContain('ASISTENTE');
  });

  it('lo ven el asistente y administración', () => {
    expect(ve('ASISTENTE')).toBe(true);
    expect(ve('ADMIN')).toBe(true);
    expect(ve('SUPER_ADMIN')).toBe(true);
  });

  it('NO lo ven un agente de ventas ni recepción, aunque el agente tenga más rango', () => {
    expect(ve('AGENTE')).toBe(false);
    expect(ve('RECEPCION')).toBe(false);
  });
});
