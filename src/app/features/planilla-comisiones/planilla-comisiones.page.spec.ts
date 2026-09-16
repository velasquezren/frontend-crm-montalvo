import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthService } from '../../core/auth/auth.service';
import { Alertas, FilaConsolidado, PeriodoComision, ReporteConsolidado } from './planilla.model';
import { PlanillaComisionesPage } from './planilla-comisiones.page';

/**
 * F08 · una respuesta vieja no puede escribir sobre el periodo que se está
 * mirando.
 *
 * `alertas` y `consolidado` eran las dos únicas lecturas de esta pantalla
 * hechas a mano con promesas; el resto (`ventas`, `desglose`, `planes`,
 * `revision`) son `httpResource` ligados a `periodoId()` y por eso ya
 * descartaban solas lo que llegaba tarde. Pedir enero, cambiar a febrero y
 * recibir enero al final dejaba cifras de enero bajo la cabecera de febrero,
 * sin ningún aviso.
 *
 * El segundo problema es de semántica: el `catch → null` metía «falló la red» y
 * «este mes no está calculado» en el mismo cajón, y la plantilla elegía el
 * cartel equivocado — «Todavía no hay liquidación calculada» sobre un servidor
 * que no contestaba.
 */

interface Diferida<T> {
  promesa: Promise<T>;
  resolver: (valor: T) => void;
  rechazar: (motivo: unknown) => void;
}

function diferida<T>(): Diferida<T> {
  let resolver!: (valor: T) => void;
  let rechazar!: (motivo: unknown) => void;
  const promesa = new Promise<T>((res, rej) => {
    resolver = res;
    rechazar = rej;
  });
  return { promesa, resolver, rechazar };
}

function periodo(id: string, mes: number): PeriodoComision {
  return {
    id, anio: 2026, mes, tipoCambio: '6.96', estado: 'CALCULADO',
    archivoNombre: `${id}.xlsx`, filasTotales: 10, filasValidas: 10,
    calculadoEn: '2026-09-16T12:00:00.000Z', configuracionUsada: null,
    enRevisionDesde: null, cerradoEn: null, cerradoPor: null,
    pagadoEn: null, pagadoPor: null, createdAt: '2026-09-01T00:00:00.000Z',
  };
}

/** Una fila cualquiera: lo único que se mira es el nombre, que la identifica. */
function fila(nombre: string): FilaConsolidado {
  return {
    vendedoraId: `v-${nombre}`, nombre, codigo: 'V01', tipo: 'VENDEDORA', area: 'EJECUTIVA',
    montoVendido: 0, baseCalculo: 0, planesVendidos: 0, cumpleObjetivoPlanes: false,
    planpaqVendidos: 0, planpaqComisionables: 0, planninVendidos: 0, planninComisionables: 0,
    acumuladoCirugias: 0, nivelCirugia: null, comisionA: 0, comisionB: 0, comisionC: 0,
    comisionTipoARA: 0, nivelTipoARA: null, bonoJefatura: 0, bonoPublicidad: 0,
    bonoTrimestral: 0, totalBonos: 0, totalUsd: 0, totalBob: 0, sueldoBase: 0,
    totalGanado: 0, pctComision: 0, oculta: false, ocultaDesde: null, motivoOculta: null,
  };
}

/** Las alertas de un mes, reconocibles por el número de filas sin clasificar. */
function alertasDe(filasSinClasificar: number): Alertas {
  return {
    totales: {
      filasExcluidas: 0, vendedorasSinConfigurar: 0, filasSinVendedora: 0,
      planesSinEstadoValido: 0, filasSinClasificar,
    },
    motivosExclusion: [], serviciosSinClasificar: [], vendedorasPendientes: [],
    porUnidadNegocio: [], porClasif: [], porTipo: [],
  };
}

/** Un consolidado reconocible por el nombre de su única fila. */
function consolidadoDe(id: string, mes: number, nombre: string): ReporteConsolidado {
  return {
    periodo: periodo(id, mes),
    filas: [fila(nombre)],
    totales: { totalUsd: 1 },
    ocultas: [],
    incluyeOcultas: false,
  };
}

/** Un consolidado que llegó bien y no tiene liquidación: el mes sin calcular. */
function consolidadoVacio(id: string, mes: number): ReporteConsolidado {
  return { periodo: periodo(id, mes), filas: [], totales: {}, ocultas: [], incluyeOcultas: false };
}

describe('F08 · carreras de respuestas en Planilla', () => {
  let fixture: ComponentFixture<PlanillaComisionesPage>;
  let pagina: PlanillaComisionesPage;

  /** Peticiones de alertas y de consolidado, en el orden en que salieron. */
  let alertasPedidas: Array<{ id: string; diferida: Diferida<Alertas> }>;
  let consolidadosPedidos: Array<{ id: string; ocultas: boolean; diferida: Diferida<ReporteConsolidado> }>;

  const servicio = {
    periodosRequest: () => undefined,
    ventasRequest: () => undefined,
    vendedorasRequest: () => undefined,
    revisionRequest: () => undefined,
    desgloseRequest: () => undefined,
    obtenerAlertas: (id: string) => {
      const pendiente = diferida<Alertas>();
      alertasPedidas.push({ id, diferida: pendiente });
      return pendiente.promesa;
    },
    obtenerConsolidado: (id: string, ocultas: boolean) => {
      const pendiente = diferida<ReporteConsolidado>();
      consolidadosPedidos.push({ id, ocultas, diferida: pendiente });
      return pendiente.promesa;
    },
  };

  /** Deja correr los microtasks y los efectos, como hace el navegador. */
  async function asentar(): Promise<void> {
    for (let i = 0; i < 4; i++) {
      await Promise.resolve();
      TestBed.tick();
    }
  }

  function seleccionar(id: string): void {
    pagina['periodoId'].set(id);
  }

  beforeEach(async () => {
    TestBed.resetTestingModule();
    vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: () => undefined }));
    alertasPedidas = [];
    consolidadosPedidos = [];

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(), provideHttpClientTesting(), provideRouter([]),
        { provide: AuthService, useValue: {
          isSuperAdmin: signal(true), isAdmin: signal(true),
          user: signal({ id: 'u1', nombre: 'Admin' }), generacionSesion: signal(1),
        } },
      ],
    });
    TestBed.overrideProvider(
      (await import('./planilla-comisiones.service')).PlanillaComisionesService,
      { useValue: servicio },
    );

    fixture = TestBed.createComponent(PlanillaComisionesPage);
    pagina = fixture.componentInstance;
    fixture.detectChanges();
    await asentar();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.unstubAllGlobals();
  });

  it('Caso A · las alertas de enero no pisan las de febrero aunque lleguen después', async () => {
    seleccionar('enero');
    await asentar();
    seleccionar('febrero');
    await asentar();

    const enero = alertasPedidas.find(p => p.id === 'enero');
    const febrero = alertasPedidas.find(p => p.id === 'febrero');
    expect(enero, 'debió pedirse las alertas de enero').toBeDefined();
    expect(febrero, 'debió pedirse las alertas de febrero').toBeDefined();

    // Febrero contesta primero; enero, la petición vieja, contesta al final.
    febrero!.diferida.resolver(alertasDe(2));
    await asentar();
    enero!.diferida.resolver(alertasDe(99));
    await asentar();

    expect(pagina['periodoId']()).toBe('febrero');
    expect(pagina['alertas']()?.totales.filasSinClasificar).toBe(2);
  });

  it('Caso B · el consolidado de enero no pisa el de febrero aunque llegue después', async () => {
    pagina['pestana'].set('REPORTES');
    seleccionar('enero');
    await asentar();
    seleccionar('febrero');
    await asentar();

    const enero = consolidadosPedidos.find(p => p.id === 'enero');
    const febrero = consolidadosPedidos.find(p => p.id === 'febrero');
    expect(enero, 'debió pedirse el consolidado de enero').toBeDefined();
    expect(febrero, 'debió pedirse el consolidado de febrero').toBeDefined();

    /* Los dos paneles viajan juntos en un `allSettled`, así que hay que
       contestar las alertas también: dejarlas colgadas no probaría la carrera
       —no se aplicaría nada— y el test pasaría por el motivo equivocado. */
    febrero!.diferida.resolver(consolidadoDe('febrero', 2, 'Vendedora de febrero'));
    alertasPedidas.find(p => p.id === 'febrero')!.diferida.resolver(alertasDe(2));
    await asentar();
    enero!.diferida.resolver(consolidadoDe('enero', 1, 'Vendedora de enero'));
    alertasPedidas.find(p => p.id === 'enero')!.diferida.resolver(alertasDe(99));
    await asentar();

    expect(pagina['periodoId']()).toBe('febrero');
    expect(pagina['consolidado']()?.filas[0].nombre).toBe('Vendedora de febrero');
    expect(pagina['consolidado']()?.periodo.mes).toBe(2);
  });

  it('Caso C · alternar ocultas dos veces no deja el consolidado de la selección anterior', async () => {
    pagina['pestana'].set('REPORTES');
    seleccionar('enero');
    await asentar();
    consolidadosPedidos.at(-1)!.diferida.resolver(consolidadoDe('enero', 1, 'Solo activas'));
    await asentar();

    const antes = consolidadosPedidos.length;
    void pagina['alternarOcultas'](); // pide CON ocultas
    await asentar();
    void pagina['alternarOcultas'](); // vuelve a SIN ocultas
    await asentar();

    const conOcultas = consolidadosPedidos.slice(antes).find(p => p.ocultas);
    const sinOcultas = consolidadosPedidos.slice(antes).find(p => !p.ocultas);
    expect(conOcultas, 'debió pedirse el consolidado con ocultas').toBeDefined();
    expect(sinOcultas, 'debió pedirse el consolidado sin ocultas').toBeDefined();

    // La segunda contesta primero; la primera, ya obsoleta, contesta al final.
    sinOcultas!.diferida.resolver(consolidadoDe('enero', 1, 'Solo activas'));
    await asentar();
    conOcultas!.diferida.resolver(consolidadoDe('enero', 1, 'Incluye dadas de baja'));
    await asentar();

    expect(pagina['incluirOcultas']()).toBe(false);
    expect(pagina['consolidado']()?.filas[0].nombre).toBe('Solo activas');
  });

  it('Caso D · un fallo de red no se presenta como «no hay liquidación calculada»', async () => {
    pagina['pestana'].set('REPORTES');
    seleccionar('enero');
    await asentar();

    consolidadosPedidos.at(-1)!.diferida.rechazar(new Error('sin respuesta del servidor'));
    alertasPedidas.at(-1)!.diferida.rechazar(new Error('sin respuesta del servidor'));
    await asentar();

    expect(pagina['errorConsolidado'](), 'un fallo debe quedar marcado como error').toBe(true);
    expect(pagina['cargandoConsolidado']()).toBe(false);
    // Y lo contrario: un mes que de verdad no tiene liquidación NO es un error.
    expect(pagina['sinLiquidacion']()).toBe(false);
  });

  it('Caso D2 · un periodo sin calcular sí dice que no hay liquidación, y no es error', async () => {
    pagina['pestana'].set('REPORTES');
    seleccionar('enero');
    await asentar();

    /* Solo se contesta el consolidado: las alertas quedan colgando a propósito.
       Los dos paneles se aplican por separado, así que uno lento no puede dejar
       al otro en su esqueleto con el dato ya recibido. */
    consolidadosPedidos.at(-1)!.diferida.resolver(consolidadoVacio('enero', 1));
    await asentar();

    expect(pagina['errorConsolidado']()).toBe(false);
    expect(pagina['cargandoConsolidado']()).toBe(false);
    expect(pagina['sinLiquidacion'](), 'filas vacías = mes sin calcular').toBe(true);
  });

  it('entrar dos veces en Reportes con la petición en vuelo no la duplica', async () => {
    seleccionar('enero');
    await asentar();
    const antes = consolidadosPedidos.length;

    pagina['setPestana']('REPORTES');
    await asentar();
    pagina['setPestana']('CLASIFICACION');
    await asentar();
    pagina['setPestana']('REPORTES'); // con la primera todavía sin contestar
    await asentar();

    /* El panel se marca como activo al SALIR la petición, no al volver. Antes
       la condición era `!consolidado()`, que sigue siendo cierta mientras la
       respuesta viaja: ir y volver de pestaña pedía el mismo consolidado otra
       vez. Es la misma confusión que F08 —estado deducido del dato en vez de
       de la petición— y se va con ella. */
    expect(consolidadosPedidos.length - antes).toBe(1);
  });

  it('Caso E · una respuesta del periodo vigente sí actualiza la pantalla', async () => {
    pagina['pestana'].set('REPORTES');
    seleccionar('enero');
    await asentar();

    expect(pagina['cargandoConsolidado'](), 'mientras viaja, la vista está cargando').toBe(true);

    alertasPedidas.at(-1)!.diferida.resolver(alertasDe(7));
    consolidadosPedidos.at(-1)!.diferida.resolver(consolidadoDe('enero', 1, 'Vendedora de enero'));
    await asentar();

    expect(pagina['alertas']()?.totales.filasSinClasificar).toBe(7);
    expect(pagina['consolidado']()?.filas[0].nombre).toBe('Vendedora de enero');
    expect(pagina['errorConsolidado']()).toBe(false);
    expect(pagina['cargandoConsolidado']()).toBe(false);
    expect(pagina['sinLiquidacion']()).toBe(false);
  });
});
