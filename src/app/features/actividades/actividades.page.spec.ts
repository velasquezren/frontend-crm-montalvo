import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting, TestRequest } from '@angular/common/http/testing';
import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthService } from '../../core/auth/auth.service';
import { Actividad } from './actividad.model';
import { ActividadesCalendarioComponent } from './components/actividades-calendario/actividades-calendario.component';
import { ActividadesPage } from './actividades.page';
import { RangoCalendario } from './rango-calendario';

/**
 * F10 · el calendario pide el rango que se está mirando.
 *
 * Antes pedía `limite: 100` y ningún rango. El backend ordena
 * `fechaProgramada: 'asc'`, así que esas cien eran las cien actividades más
 * ANTIGUAS del historial entero. Reproducido aquí antes de arreglarlo: con 151
 * en la base y el calendario en septiembre de 2026, llegaban 100 filas y todas
 * eran de 2024 — mes vacío en pantalla, teniendo actividades.
 *
 * El doble del calendario existe porque Schedule-X quiere DOM real y deja
 * temporizadores vivos; lo que prueba F10 es la PÁGINA: qué rango pide y qué
 * hace con la respuesta. Que el widget publique bien su rango se prueba aparte,
 * en `rango-calendario.spec.ts`.
 */
@Component({
  selector: 'app-actividades-calendario',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '',
})
class CalendarioDoble {
  readonly actividades = input.required<readonly Actividad[]>();
  readonly seleccionada = output<Actividad>();
  readonly rangoVisible = output<RangoCalendario>();
}

/** Tope de paginación del backend (`LIMITE_MAXIMO` de `common/dto`). */
const LIMITE_MAXIMO = 100;

/** Septiembre de 2026 completo, en hora de Bolivia (UTC-4). */
const SEPTIEMBRE: RangoCalendario = {
  desde: '2026-09-01T04:00:00Z',
  hasta: '2026-10-01T03:59:59.999Z',
};
const OCTUBRE: RangoCalendario = {
  desde: '2026-10-01T04:00:00Z',
  hasta: '2026-11-01T03:59:59.999Z',
};

function actividad(id: string, fechaProgramada: string): Actividad {
  return {
    id, tipo: 'TAREA', titulo: `Actividad ${id}`, notas: null,
    fechaProgramada, duracionMinutos: 30, estado: 'PENDIENTE',
    completadaEn: null, notificadaEn: null, createdAt: fechaProgramada,
    cliente: { id: 'c1', nombre: 'Paciente', telefono: '+59170000000' },
    agente: { id: 'u1', nombre: 'Agente' },
  } as unknown as Actividad;
}

describe('F10 · rango visible del calendario de Actividades', () => {
  let http: HttpTestingController;
  let pagina: ActividadesPage;
  let fixture: ComponentFixture<ActividadesPage>;
  let calendario: CalendarioDoble;
  let baseDatos: Actividad[];

  async function asentar(): Promise<void> {
    for (let i = 0; i < 4; i++) {
      await Promise.resolve();
      TestBed.tick();
    }
  }

  /** Contesta como `ActividadesService.findAll`: rango inclusivo, asc, tope 100. */
  function contestar(peticion: TestRequest): void {
    const p = peticion.request.params;
    const desde = p.get('desde');
    const hasta = p.get('hasta');
    const limite = Number(p.get('limite') ?? 25);
    const numeroPagina = Number(p.get('pagina') ?? 1);

    const enRango = baseDatos.filter(a => {
      const t = Date.parse(a.fechaProgramada);
      if (desde && t < Date.parse(desde)) return false; // gte
      if (hasta && t > Date.parse(hasta)) return false; // lte
      return true;
    });
    enRango.sort((a, b) => Date.parse(a.fechaProgramada) - Date.parse(b.fechaProgramada));

    const take = Math.min(LIMITE_MAXIMO, limite);
    const datos = enRango.slice((numeroPagina - 1) * take, (numeroPagina - 1) * take + take);
    peticion.flush({
      datos, total: enRango.length, pagina: numeroPagina, limite: take,
      totalPaginas: Math.max(1, Math.ceil(enRango.length / take)),
    });
  }

  /** Solo las del calendario: la vista Lista pide al mismo endpoint con `estado`. */
  function peticionesDelCalendario(): TestRequest[] {
    return http.match(r => r.url.endsWith('/actividades') && r.params.has('desde') && !r.params.has('estado'));
  }

  /** Todo lo que salga hacia /actividades, tenga rango o no. */
  function peticionesSinEstado(): TestRequest[] {
    return http.match(r => r.url.endsWith('/actividades') && !r.params.has('estado'));
  }

  /** La baja de la original: PATCH /actividades/:id/estado */
  function completados(): TestRequest[] {
    return http.match(r => r.method === 'PATCH' && /\/actividades\/[^/]+\/estado$/.test(r.url));
  }

  /** El alta del seguimiento: POST /actividades */
  function creados(): TestRequest[] {
    return http.match(r => r.method === 'POST' && r.url.endsWith('/actividades'));
  }

  function mostrarMes(rango: RangoCalendario): void {
    calendario.rangoVisible.emit(rango);
  }

  beforeEach(async () => {
    TestBed.resetTestingModule();
    vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: () => undefined }));

    // 150 actividades de 2024 + una de septiembre de 2026.
    baseDatos = [];
    for (let i = 0; i < 150; i++) {
      const dia = String((i % 28) + 1).padStart(2, '0');
      const mes = String((i % 12) + 1).padStart(2, '0');
      baseDatos.push(actividad(`vieja-${i}`, `2024-${mes}-${dia}T14:00:00.000Z`));
    }
    baseDatos.push(actividad('la-de-septiembre', '2026-09-10T14:00:00.000Z'));
    baseDatos.push(actividad('la-de-octubre', '2026-10-05T14:00:00.000Z'));

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(), provideHttpClientTesting(), provideRouter([]),
        { provide: AuthService, useValue: {
          isAdmin: signal(false), isSuperAdmin: signal(false),
          user: signal({ id: 'u1', nombre: 'Agente' }), generacionSesion: signal(1),
        } },
      ],
    });
    TestBed.overrideComponent(ActividadesPage, {
      remove: { imports: [ActividadesCalendarioComponent] },
      add: { imports: [CalendarioDoble] },
    });

    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(ActividadesPage);
    pagina = fixture.componentInstance;
    fixture.detectChanges();
    pagina['vista'].set('CALENDARIO');
    fixture.detectChanges();
    await asentar();
    calendario = fixture.debugElement.query(By.directive(CalendarioDoble)).componentInstance;
  });

  afterEach(() => {
    fixture?.destroy();
    TestBed.resetTestingModule();
    vi.unstubAllGlobals();
  });

  it('A1 · el filtro «Hoy» pide el día de la clínica, no el del navegador', async () => {
    /* 16/09/2026 21:30 en La Paz, que en UTC ya es el 17. Antes, con el reloj
       del navegador en UTC, el filtro pedía desde el 17 a las 00:00 y dejaba
       fuera toda la tarde de la clínica — justo la que el KPI estaba contando
       como «Hoy». */
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2026-09-17T01:30:00.000Z'));
    try {
      pagina['vista'].set('LISTA');
      pagina['filtroRapido'].set('HOY');
      await asentar();

      const lista = http.match(r => r.url.endsWith('/actividades') && r.params.has('estado'));
      expect(lista.length).toBeGreaterThan(0);
      const ultima = lista[lista.length - 1].request.params;
      /* Los mismos instantes exactos que fija la prueba del backend: es lo que
         mantiene a las dos mitades diciendo el mismo día. */
      expect(ultima.get('desde')).toBe('2026-09-16T04:00:00.000Z');
      expect(ultima.get('hasta')).toBe('2026-09-17T04:00:00.000Z');
    } finally {
      vi.useRealTimers();
    }
  });

  it('no pide nada hasta saber qué mes se está mirando', async () => {
    expect(peticionesSinEstado().length).toBe(0);
  });

  it('Caso A · con 150 actividades antiguas, la del mes visible llega al calendario', async () => {
    mostrarMes(SEPTIEMBRE);
    await asentar();

    /* Se contesta lo que la página haya pedido, con rango o sin él: el síntoma
       tiene que afirmarse por sí mismo. Con el código anterior salía
       `/actividades?limite=100` y volvían 100 filas, TODAS de 2024, con
       `total: 151` — el calendario de septiembre de 2026 quedaba vacío y el
       aviso decía «Mostrando 100 de 151», que se lee como «hay más», no como
       «estás viendo 2024». */
    const peticiones = peticionesSinEstado();
    for (const p of peticiones) contestar(p);
    await asentar();

    const valor = pagina['actividadesCalendario'].value();
    expect(
      valor.datos.some(a => a.id === 'la-de-septiembre'),
      'la actividad del mes visible debe llegar; el corte de 100 ascendente la dejaba fuera',
    ).toBe(true);
    expect(valor.datos.every(a => a.fechaProgramada.startsWith('2026-09'))).toBe(true);
    expect(valor.total).toBe(1);

    // Y el mecanismo: se pidió exactamente el rango visible, una sola vez.
    expect(peticiones.length).toBe(1);
    expect(peticiones[0].request.params.get('desde')).toBe(SEPTIEMBRE.desde);
    expect(peticiones[0].request.params.get('hasta')).toBe(SEPTIEMBRE.hasta);
  });

  it('Caso C · ir al mes siguiente consulta ese rango, no otro', async () => {
    mostrarMes(SEPTIEMBRE);
    await asentar();
    contestar(peticionesDelCalendario()[0]);
    await asentar();

    mostrarMes(OCTUBRE);
    await asentar();

    const siguiente = peticionesDelCalendario();
    expect(siguiente.length).toBe(1);
    expect(siguiente[0].request.params.get('desde')).toBe(OCTUBRE.desde);
    contestar(siguiente[0]);
    await asentar();

    expect(pagina['actividadesCalendario'].value().datos.map(a => a.id)).toEqual(['la-de-octubre']);
  });

  it('Caso D · volver al mismo mes no vuelve a preguntar', async () => {
    mostrarMes(SEPTIEMBRE);
    await asentar();
    contestar(peticionesDelCalendario()[0]);
    await asentar();

    // Schedule-X reemite su rango en repintados que no cambian de mes.
    mostrarMes({ ...SEPTIEMBRE });
    mostrarMes({ ...SEPTIEMBRE });
    await asentar();

    expect(peticionesSinEstado().length).toBe(0);
  });

  it('Caso B · una respuesta tardía de septiembre no contamina octubre', async () => {
    mostrarMes(SEPTIEMBRE);
    await asentar();
    const deSeptiembre = peticionesDelCalendario()[0];

    mostrarMes(OCTUBRE);
    await asentar();

    /* La garantía de F08, aquí sin contadores: el recurso cuelga del rango, así
       que al cambiar de mes Angular CANCELA la petición anterior y su respuesta
       ya no puede escribir. Que esté cancelada es la prueba. */
    expect(deSeptiembre.cancelled).toBe(true);

    const deOctubre = peticionesDelCalendario()[0];
    expect(deOctubre.request.params.get('desde')).toBe(OCTUBRE.desde);
    contestar(deOctubre);
    await asentar();

    expect(pagina['actividadesCalendario'].value().datos.map(a => a.id)).toEqual(['la-de-octubre']);
  });

  it('Caso E · un fallo HTTP no se presenta como un mes sin actividades', async () => {
    mostrarMes(SEPTIEMBRE);
    await asentar();
    peticionesDelCalendario()[0].flush('sin respuesta', { status: 500, statusText: 'Server Error' });
    await asentar();

    expect(pagina['actividadesCalendario'].error(), 'el recurso debe quedar en error').toBeTruthy();

    /* Lo que importa es lo que se ve: el cartel de error, y NO un calendario
       vacío que se leería como «este mes no tienes nada». */
    fixture.detectChanges();
    expect(fixture.debugElement.query(By.css('app-error-carga'))).not.toBeNull();
    expect(fixture.debugElement.query(By.directive(CalendarioDoble))).toBeNull();

    /* Y de paso queda fijado por qué la plantilla mira `error()` ANTES que los
       datos: `value()` LANZA mientras el recurso está en error. Invertir esas
       dos ramas rompería la pantalla entera, no solo el mensaje. */
    expect(() => pagina['actividadesCalendario'].value()).toThrow();
  });

  it('Caso F · un mes realmente vacío es un vacío legítimo, sin error', async () => {
    baseDatos = baseDatos.filter(a => !a.fechaProgramada.startsWith('2026-09'));
    mostrarMes(SEPTIEMBRE);
    await asentar();
    contestar(peticionesDelCalendario()[0]);
    await asentar();

    const recurso = pagina['actividadesCalendario'];
    expect(recurso.error()).toBeFalsy();
    expect(recurso.value().datos.length).toBe(0);
    expect(recurso.value().total).toBe(0);
    /* Sin aviso de truncado: `total` y lo recibido coinciden. */
    expect(recurso.value().total > recurso.value().datos.length).toBe(false);

    /* Y el calendario SIGUE en pantalla, con cero eventos: la rejilla vacía es
       el estado vacío legítimo de un calendario. Lo contrario —el cartel de
       error— es justo lo que este caso distingue del anterior. */
    fixture.detectChanges();
    expect(fixture.debugElement.query(By.css('app-error-carga'))).toBeNull();
    expect(fixture.debugElement.query(By.directive(CalendarioDoble))).not.toBeNull();
    expect(calendario.actividades().length).toBe(0);
  });

  it('el mes con más de 100 actividades avisa de que se está truncando', async () => {
    baseDatos = [];
    for (let i = 0; i < 120; i++) {
      const dia = String((i % 28) + 1).padStart(2, '0');
      baseDatos.push(actividad(`sept-${i}`, `2026-09-${dia}T14:00:00.000Z`));
    }
    mostrarMes(SEPTIEMBRE);
    await asentar();
    contestar(peticionesDelCalendario()[0]);
    await asentar();

    const valor = pagina['actividadesCalendario'].value();
    /* El tope sigue siendo 100, pero ahora es el tope DEL MES y no el del
       historial entero: se recortan 20 de septiembre, no se enseñan 100 de 2024. */
    expect(valor.datos.length).toBe(100);
    expect(valor.total).toBe(120);
    expect(valor.datos.every(a => a.fechaProgramada.startsWith('2026-09'))).toBe(true);
  });

  /**
   * A2 · «Completar y agendar siguiente paso», ahora desde la página.
   *
   * Tras A3 el formulario es un componente aparte y no sabe que esta intención
   * existe: agenda y emite `guardada`. La regla —cerrar la original solo cuando
   * el seguimiento ya está guardado— vive aquí, y aquí se prueba. Lo que el
   * formulario hace por dentro (validar, componer el payload, conservar los
   * datos ante un error) se prueba en su propio spec.
   */
  describe('A2 · completar y agendar el siguiente paso', () => {
    const PENDIENTE = actividad('la-original', '2026-09-20T14:00:00.000Z');
    const SEGUIMIENTO = actividad('el-seguimiento', '2026-09-27T14:00:00.000Z');

    it('Caso A · si la agente cancela, la original sigue PENDIENTE', async () => {
      pagina['completarYAgendarSiguiente'](PENDIENTE);
      await asentar();

      pagina['cerrarModal']();
      await asentar();

      expect(creados(), 'no se agendó ningún seguimiento').toHaveLength(0);
      expect(
        completados(),
        'y por tanto la original NO puede haberse completado',
      ).toHaveLength(0);
    });

    it('Caso A2 · pulsar el botón no manda nada por la red', async () => {
      pagina['completarYAgendarSiguiente'](PENDIENTE);
      await asentar();

      expect(completados()).toHaveLength(0);
      expect(creados()).toHaveLength(0);
      /* Y el formulario recibe el contexto con el paciente y el lead de la
         original: es todo lo que la página le cuenta. */
      const contexto = pagina['contextoFormulario']();
      expect(contexto?.modo).toBe('CREAR');
      expect(contexto?.modo === 'CREAR' && contexto.cliente?.id).toBe(PENDIENTE.cliente.id);
    });

    it('Caso B · cuando el formulario avisa de que guardó, se completa la original', async () => {
      pagina['completarYAgendarSiguiente'](PENDIENTE);
      await asentar();

      /* Sin `await` todavía: la promesa no resuelve hasta que se conteste la
         petición de cierre, y contestarla es precisamente lo que viene. */
      const orquestacion = pagina['alGuardarFormulario']({
        modo: 'CREAR', actividad: SEGUIMIENTO, vecesAgendadas: 1,
      });
      await asentar();

      const cierre = completados();
      expect(cierre).toHaveLength(1);
      expect(cierre[0].request.url).toContain(PENDIENTE.id);
      expect(cierre[0].request.body.estado).toBe('COMPLETADA');
      cierre[0].flush({ ...PENDIENTE, estado: 'COMPLETADA' });
      await orquestacion;
    });

    it('un alta normal, sin intención de A2, no completa nada', async () => {
      pagina['abrirCreacion']();
      await asentar();

      await pagina['alGuardarFormulario']({
        modo: 'CREAR', actividad: SEGUIMIENTO, vecesAgendadas: 1,
      });
      await asentar();

      expect(completados()).toHaveLength(0);
    });

    it('cerrar el cajón después de pulsar el botón olvida la intención', async () => {
      pagina['completarYAgendarSiguiente'](PENDIENTE);
      await asentar();
      pagina['cerrarModal']();
      await asentar();

      /* Aunque después llegue un guardado —un alta corriente—, la original no
         se cierra: la intención se consumió al cancelar. */
      await pagina['alGuardarFormulario']({
        modo: 'CREAR', actividad: SEGUIMIENTO, vecesAgendadas: 1,
      });
      await asentar();

      expect(completados()).toHaveLength(0);
    });
  });
});
