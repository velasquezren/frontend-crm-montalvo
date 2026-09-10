import '@angular/compiler';
import { describe, expect, it } from 'vitest';

import { Actividad } from '../../actividad.model';

import { aEventoCalendario, calendarioDe } from './actividad-a-evento';

/**
 * Lo que hace que un clic en el calendario abra el cajón de detalle.
 *
 * Pulsar un evento y pulsar una fila de la lista terminan en la MISMA función
 * de la página (`abrirDetalle`), así que el detalle se pinta en un solo sitio.
 * Lo único que separa los dos caminos es este mapeo: el calendario no guarda la
 * actividad, guarda un evento, y el `id` es el único hilo que los une. El
 * componente busca por ese id para saber a quién abrir.
 *
 * Si el id deja de coincidir, **el clic no falla: no hace nada**. Sin error, sin
 * log, sin nada que mirar. Por eso se fija aquí y no se deja al criterio de
 * quien toque el mapeo la próxima vez.
 *
 * Esta lógica vive fuera del componente para poder probarla sin instanciar un
 * calendario: `@schedule-x/calendar` entra solo como tipo.
 */

function actividad(sobrescribir: Partial<Actividad> = {}): Actividad {
  return {
    id: 'act-1',
    titulo: 'Llamar a la paciente',
    tipo: 'LLAMADA',
    estado: 'PENDIENTE',
    fechaProgramada: '2030-01-15T14:00:00.000Z',
    duracionMinutos: 30,
    notas: null,
    cliente: { id: 'cli-1', nombre: 'Ana García', telefono: '+59170000001', pac: null },
    ...sobrescribir,
  } as Actividad;
}

describe('aEventoCalendario', () => {
  it('el id del evento ES el de la actividad — de eso depende el clic', () => {
    expect(aEventoCalendario(actividad({ id: 'abc-123' })).id).toBe('abc-123');
  });

  it('lleva el título y el nombre de la paciente', () => {
    const evento = aEventoCalendario(actividad());

    expect(evento.title).toBe('Llamar a la paciente');
    expect(evento.description).toBe('Ana García');
  });

  /* Una llamada de 15 min no debe verse igual de alta que una reunión de una
     hora en las vistas de semana y día. */
  it('la altura del bloque sale de la duración real', () => {
    const evento = aEventoCalendario(actividad({ duracionMinutos: 90 }));

    expect(evento.start.until(evento.end).total({ unit: 'minute' })).toBe(90);
  });

  /* Una de 0 minutos sería una línea invisible, imposible de pulsar — y un
     evento que no se puede pulsar no abre ningún cajón. */
  it('una actividad sin duración conserva un mínimo pulsable', () => {
    const evento = aEventoCalendario(actividad({ duracionMinutos: 0 }));

    expect(evento.start.until(evento.end).total({ unit: 'minute' })).toBe(5);
  });
});

describe('calendarioDe', () => {
  /**
   * Los cuatro nombres son los mismos que declara `calendars` en el componente
   * y los mismos que pinta la leyenda. Un quinto estado que no se añada a los
   * tres sitios sale sin color y sin entrada en la leyenda.
   */
  it('cancelada y completada mandan sobre el vencimiento', () => {
    const vencida = { fechaProgramada: '2020-01-01T10:00:00.000Z' };

    expect(calendarioDe(actividad({ ...vencida, estado: 'CANCELADA' }))).toBe('neutral');
    expect(calendarioDe(actividad({ ...vencida, estado: 'COMPLETADA' }))).toBe('secundaria');
  });

  it('una pendiente vencida se distingue de una a tiempo', () => {
    expect(
      calendarioDe(actividad({ estado: 'PENDIENTE', fechaProgramada: '2020-01-01T10:00:00.000Z' })),
    ).toBe('critica');
    expect(calendarioDe(actividad({ estado: 'PENDIENTE' }))).toBe('primaria');
  });
});
