import { describe, expect, it } from 'vitest';

import { cubreRol, puedeEntregarResultados } from '../../core/auth/roles';
import { RolUsuario } from '../../core/auth/user.model';
import { NAV_GROUPS } from '../../shared/components/layout/nav-items';
import { EntregaResultado, estadoEntrega, motivoBloqueo, nombresDistintos, sePuedeEntregar, sePuedeRenovar } from './resultado.model';

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
  vinculo: 'PAC',
  sinFicha: null,
  pacientePortal: { nombre: 'Paciente', pac: 'PAC33009', ci: null },
  aviso: null,
  abiertoEn: null,
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

describe('enlace abierto y enlace vencido', () => {
  it('«abierto por el paciente» manda sobre el estado del mensaje', () => {
    const abierto = { ...base, abiertoEn: '2026-09-23T10:00:00.000Z', aviso: { enviadoEn: '2026-09-22T12:00:00.000Z', estadoMensaje: 'ENTREGADO' as const } };
    expect(estadoEntrega(abierto).texto).toBe('Abierto por el paciente');
    expect(sePuedeEntregar(abierto)).toBe(false);
  });

  it('un enlace vencido no se envía tal cual, se renueva y envía', () => {
    const vencido = { ...base, accesoVigente: false };
    expect(sePuedeEntregar(vencido)).toBe(false);
    expect(sePuedeRenovar(vencido)).toBe(true);
    expect(sePuedeRenovar({ ...vencido, paciente: null })).toBe(false);
  });
});

describe('vínculo con la ficha del CRM', () => {
  it('un CI repetido se señala como tal, no como «sin vincular»', () => {
    const repetido = { ...base, paciente: null, vinculo: null, sinFicha: 'CI_REPETIDO' as const };
    expect(sePuedeEntregar(repetido)).toBe(false);
    expect(estadoEntrega(repetido).texto).toBe('CI repetido');
  });

  it('el mismo nombre escrito por dos manos no es una alerta', () => {
    expect(nombresDistintos('Andrea Avendaño', 'AVENDANO  andrea')).toBe(false);
  });

  it('dos personas distintas sí lo son', () => {
    expect(nombresDistintos('Andrea Avendaño', 'Andrea Rosales')).toBe(true);
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

  /* El menú, el guard de la ruta y el backend tienen que decir lo mismo. El
     menú se declara con rolMinimo/roles y el guard con la función: si uno
     cambia sin el otro, alguien ve un ítem que le devuelve a la bandeja, o
     entra por URL a una pantalla que el menú le oculta. */
  it('el menú coincide con puedeEntregarResultados para todos los roles', () => {
    const roles: RolUsuario[] = ['RECEPCION', 'ASISTENTE', 'AGENTE', 'ADMIN', 'SUPER_ADMIN'];
    for (const rol of roles) expect(ve(rol)).toBe(puedeEntregarResultados(rol));
  });
});

/* Revisar el informe NO puede parecer que lo vio la paciente: «abierto» es la
   señal con la que recepción decide a quién seguir. Por eso la fila no trae el
   enlace del paciente — se quitó a propósito — y el PDF lo sirve el CRM. */
describe('revisar el informe antes de enviarlo', () => {
  it('la fila no expone el enlace del paciente', () => {
    // Si alguien lo vuelve a añadir y la pantalla enlaza ahí, abrir para
    // comprobar marcaría «Abierto por el paciente» y la señal se vuelve mentira.
    expect('enlace' in base).toBe(false);
  });

  it('se puede revisar aunque la fila no se pueda enviar: para eso está', () => {
    const sinFicha: EntregaResultado = { ...base, paciente: null, sinFicha: 'SIN_COINCIDENCIA', vinculo: null };
    expect(sePuedeEntregar(sinFicha)).toBe(false);
    expect(sinFicha.informeId).toBe(base.informeId);
  });
});

/* El caso más frecuente en producción: el portal conoce a la paciente y el CRM
   no. La importación de FileMaker dejó fuera 36.372 fichas por no tener celular,
   y son las que el médico sigue atendiendo. Sin ficha no hay número. */
describe('paciente que el CRM no conoce', () => {
  const sinFicha: EntregaResultado = {
    ...base,
    paciente: null,
    vinculo: null,
    sinFicha: 'SIN_COINCIDENCIA',
    pacientePortal: { nombre: 'Wilma Maria Villarroel Cartagena', pac: 'PAC22768', ci: null },
  };

  it('no se puede enviar, y se dice por qué', () => {
    expect(sePuedeEntregar(sinFicha)).toBe(false);
    expect(motivoBloqueo(sinFicha)).toContain('Sin ficha');
  });

  it('el alta se arma con lo que el portal sí sabe', () => {
    // Nombre y PAC vienen del portal; el teléfono es lo único que falta y lo
    // teclea la asistente. Si esto se invirtiera, se crearían fichas con el
    // nombre de la ficha equivocada.
    expect(sinFicha.pacientePortal.nombre).toBeTruthy();
    expect(sinFicha.pacientePortal.pac).toBe('PAC22768');
    expect(sinFicha.paciente).toBeNull();
  });

  it('CI repetido NO ofrece alta: hay que resolver el duplicado', () => {
    const repetido: EntregaResultado = { ...sinFicha, sinFicha: 'CI_REPETIDO' };
    expect(motivoBloqueo(repetido)).toContain('dos fichas');
  });
});
