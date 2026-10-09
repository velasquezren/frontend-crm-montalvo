/* `@angular/common` viene precompilado para AOT; en vitest su `PlatformLocation`
   cae al compilador JIT, que hay que cargar antes. Mismo preámbulo que
   `input.component.spec.ts` y `dialog.service.spec.ts`. */
import '@angular/compiler';

import { registerLocaleData } from '@angular/common';
import localeEsBo from '@angular/common/locales/es-BO';
import { Injector, LOCALE_ID, runInInjectionContext } from '@angular/core';
import { describe, expect, it } from 'vitest';

import { FechaCivilPipe } from './fecha-civil.pipe';
import { FechaClinicaPipe } from './fecha-clinica.pipe';
import { offsetClinica } from './zona-clinica';

/*
 * Lo que se fija aquí NO es el formato: es que el día y la hora que se leen en
 * pantalla sean los de la clínica y no los del dispositivo de quien mira.
 *
 * Las fechas de venta del Excel están guardadas a medianoche de La Paz
 * (04:00 UTC). Desde Bolivia se leían bien por casualidad —la zona del
 * navegador coincidía—; desde Lima o Bogotá (UTC-5) esos mismos instantes caen
 * a las 23:00 del día ANTERIOR. Las pruebas que importan son las de la franja
 * de medianoche, porque son las únicas que distinguen un pipe correcto de uno
 * que simplemente se ejecuta en la máquina adecuada.
 */
function conLocale<T>(construir: () => T): T {
  const injector = Injector.create({ providers: [{ provide: LOCALE_ID, useValue: 'en-US' }] });
  return runInInjectionContext(injector, construir);
}

const montarCivil = (): FechaCivilPipe => conLocale(() => new FechaCivilPipe());

/*
 * El idioma de las fechas, que es el de la app: `es-BO`.
 *
 * Hasta el 2026-10-09 nadie proveía `LOCALE_ID`, así que Angular usaba `en-US`
 * y los quince formatos con mes de texto salían en inglés —«9 Oct 2026»— en una
 * clínica boliviana, conviviendo con los helpers de TS que sí lo hacían en
 * español. Lo que se fija aquí es el idioma, no el formato: por eso se compara
 * con el mes escrito, que es lo que se perdió.
 */
describe('el idioma de las fechas es el de la clínica', () => {
  registerLocaleData(localeEsBo);
  const conEsBo = <T,>(construir: () => T): T => {
    const injector = Injector.create({ providers: [{ provide: LOCALE_ID, useValue: 'es-BO' }] });
    return runInInjectionContext(injector, construir);
  };

  it('un instante de operación escribe el mes en español', () => {
    const pipe = conEsBo(() => new FechaClinicaPipe());
    /* Agosto y enero son los que delatan el idioma: «Aug» y «Jan» no se
       confunden con nada. */
    expect(pipe.transform('2026-08-14T16:00:00.000Z', 'd MMM y')).toBe('14 ago 2026');
    expect(pipe.transform('2026-01-20T16:00:00.000Z', 'd MMM y')).toBe('20 ene 2026');
  });

  it('un día de calendario también', () => {
    const pipe = conEsBo(() => new FechaCivilPipe());
    expect(pipe.transform('2026-08-14')).toBe('14 ago 2026');
    expect(pipe.transform('2026-12-01')).toBe('1 dic 2026');
  });
});

describe('FechaClinicaPipe', () => {
  /* Inyector mínimo en vez de TestBed: el pipe solo necesita `LOCALE_ID`, y
     así la prueba no arrastra la compilación de un módulo de pruebas. El
     locale va fijado para que las expectativas no dependan de la app; los
     formatos de abajo son numéricos y no cambian con el idioma. */
  const montar = (): FechaClinicaPipe => conLocale(() => new FechaClinicaPipe());

  /* El caso que lo decide todo: 03:30 UTC del día 9 es 23:30 del día 8 en la
     clínica. Un pipe que use la zona del navegador dirá «9» en Europa o en UTC
     y «8» en Bolivia; este dice «8» en todas partes. */
  it('un instante de la noche boliviana conserva SU día, aunque en UTC ya sea el siguiente', () => {
    const pipe = montar();
    const instante = '2026-10-09T03:30:00.000Z';

    expect(pipe.transform(instante, 'dd/MM/yyyy')).toBe('08/10/2026');
    expect(pipe.transform(instante, 'HH:mm')).toBe('23:30');
  });

  it('la medianoche de la clínica abre el día, no lo cierra', () => {
    const pipe = montar();
    /* 04:00 UTC = 00:00 en La Paz: es el instante con el que el importador del
       Excel ancla cada fecha de venta. */
    expect(pipe.transform('2026-01-05T04:00:00.000Z', 'dd/MM/yyyy')).toBe('05/01/2026');
    expect(pipe.transform('2026-01-05T04:00:00.000Z', 'HH:mm')).toBe('00:00');
  });

  it('un instante del mediodía cae el mismo día en las dos zonas (no se mueve nada de más)', () => {
    const pipe = montar();
    expect(pipe.transform('2026-10-08T16:00:00.000Z', 'dd/MM/yyyy')).toBe('08/10/2026');
    expect(pipe.transform('2026-10-08T16:00:00.000Z', 'HH:mm')).toBe('12:00');
  });

  /* Literales a propósito, no un `DatePipe` crudo con '-0400': una prueba que
     calcula lo que espera con la misma herramienta que mide pasa igual si las
     dos se equivocan. Estos tres valores están escritos a mano y la suite
     entera se corre además con TZ=UTC y TZ=America/Lima para comprobar que no
     se mueven. */
  it('el resultado no depende de la zona del proceso que corre', () => {
    const pipe = montar();
    expect(pipe.transform('2026-10-09T03:30:00.000Z', 'dd/MM/yyyy HH:mm')).toBe('08/10/2026 23:30');
    expect(pipe.transform('2026-01-05T04:00:00.000Z', 'dd/MM/yyyy HH:mm')).toBe('05/01/2026 00:00');
    expect(pipe.transform('2026-06-30T23:59:59.000Z', 'dd/MM/yyyy HH:mm')).toBe('30/06/2026 19:59');
  });

  it('nulo, indefinido y cadena vacía no pintan «1/1/1970»', () => {
    const pipe = montar();
    expect(pipe.transform(null)).toBe('');
    expect(pipe.transform(undefined)).toBe('');
    expect(pipe.transform('')).toBe('');
  });

  it('acepta Date y epoch, no solo cadenas ISO', () => {
    const pipe = montar();
    const instante = new Date('2026-10-09T03:30:00.000Z');
    expect(pipe.transform(instante, 'dd/MM/yyyy')).toBe('08/10/2026');
    expect(pipe.transform(instante.getTime(), 'dd/MM/yyyy')).toBe('08/10/2026');
  });

  /*
   * La frontera del pipe, y la razón de que la fecha de estudio de Resultados
   * siga con `'UTC'`.
   *
   * Un valor date-only («2026-01-02», o un `@db.Date` que la API serializa como
   * «2026-01-02T00:00:00.000Z») no es un instante: es un día de calendario.
   * Pedirle una zona no significa nada, y lo que hace `DatePipe` con esa
   * combinación **depende de la máquina**. Medido sobre esta misma prueba:
   *
   *     TZ=America/La_Paz → 02/01/2026      TZ=UTC         → 01/01/2026
   *     TZ=America/Lima   → 02/01/2026      TZ=Europe/Madrid → 01/01/2026
   *
   * Por eso no se afirma aquí qué devuelve `fechaClinica` con un date-only:
   * sería fijar el artefacto de esta máquina. Lo que se fija es el camino que
   * sí es estable en todas, que es el que usa Resultados.
   */
  it('un date-only va por `fechaCivil`, no por aquí', () => {
    const soloFecha = '2026-01-02';
    const civil = montarCivil();

    /* El valor crudo es el día 2, comprobado sin pipes. */
    expect(new Date(soloFecha).toISOString().slice(0, 10)).toBe('2026-01-02');
    expect(civil.transform(soloFecha, 'dd/MM/yyyy')).toBe('02/01/2026');
  });
});

describe('offsetClinica', () => {
  it('es el desfase de la clínica en el formato que acepta DatePipe', () => {
    expect(offsetClinica(new Date('2026-10-08T16:00:00.000Z'))).toBe('-0400');
  });

  it('Bolivia no usa horario de verano: el mismo desfase en enero y en julio', () => {
    expect(offsetClinica('2026-01-15T12:00:00.000Z')).toBe('-0400');
    expect(offsetClinica('2026-07-15T12:00:00.000Z')).toBe('-0400');
  });

  it('una entrada inválida no revienta ni inventa un desfase de la clínica', () => {
    expect(offsetClinica('no es una fecha')).toBe('+0000');
  });
});

/*
 * El día de calendario, que NO tiene zona.
 *
 * Estas pruebas valen por correrse con `TZ` distintas: `| date: '…' : 'UTC'`
 * —lo que usaba Resultados— las pasa al oeste de UTC y las falla al este,
 * porque `DatePipe` parsea «2026-09-20» como medianoche local antes de aplicar
 * la zona pedida. Construir medianoche UTC desde los componentes de la cadena
 * no mira la zona del proceso.
 */
describe('FechaCivilPipe', () => {
  it('el día que dice la cadena es el día que se muestra', () => {
    const pipe = montarCivil();
    expect(pipe.transform('2026-09-20', 'dd/MM/yyyy')).toBe('20/09/2026');
    expect(pipe.transform('2026-01-01', 'dd/MM/yyyy')).toBe('01/01/2026');
    expect(pipe.transform('2026-12-31', 'dd/MM/yyyy')).toBe('31/12/2026');
  });

  it('lee igual un `@db.Date` serializado con hora UTC', () => {
    const pipe = montarCivil();
    expect(pipe.transform('2026-09-20T00:00:00.000Z', 'dd/MM/yyyy')).toBe('20/09/2026');
  });

  it('no inventa un día ante un valor vacío o con otra forma', () => {
    const pipe = montarCivil();
    expect(pipe.transform(null)).toBe('');
    expect(pipe.transform(undefined)).toBe('');
    expect(pipe.transform('')).toBe('');
    expect(pipe.transform('20/09/2026')).toBe('');
  });
});
