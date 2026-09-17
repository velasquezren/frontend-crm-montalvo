import '@angular/compiler';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting, TestRequest } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { aDatetimeLocal } from '../../../../core/api/fecha';
import { Actividad } from '../../actividad.model';
import {
  ActividadFormularioComponent,
  ContextoFormulario,
  ResultadoFormulario,
} from './actividad-formulario.component';

/**
 * A3 · el formulario de actividad, ya como componente.
 *
 * Aquí vive lo que el formulario posee tras la extracción: sus campos, su
 * validación, el payload que compone y qué hace cuando el guardado falla. Lo
 * que NO se prueba aquí es «completar y agendar siguiente»: esa intención es de
 * la página y se prueba en su spec, porque este componente no la conoce.
 */

const CLIENTE = { id: 'cliente-1', nombre: 'María Fernanda', telefono: '+59171234567' };

function actividad(id: string, parcial: Partial<Actividad> = {}): Actividad {
  return {
    id, tipo: 'LLAMADA', titulo: 'Llamar a la paciente', notas: 'Confirmar hora',
    fechaProgramada: '2026-09-20T14:00:00.000Z', duracionMinutos: 45, estado: 'PENDIENTE',
    completadaEn: null, notificadaEn: null, createdAt: '2026-09-01T12:00:00.000Z',
    cliente: CLIENTE, agente: { id: 'u1', nombre: 'Agente' }, lead: null,
    serieId: null, frecuenciaSerie: null,
    ...parcial,
  } as unknown as Actividad;
}

/**
 * Estrecha el resultado a la rama que la prueba dice esperar.
 *
 * Desde A5.3 `ResultadoFormulario` es una unión: leer `vecesAgendadas` de un
 * guardado que pudo ser colectivo ya no compila, y eso es exactamente lo que se
 * quería. Estas dos funciones hacen explícito «espero una creación» en vez de
 * apagar el tipo con un `as`.
 */
function creacion(r: ResultadoFormulario): Extract<ResultadoFormulario, { modo: 'CREAR' }> {
  if (r.modo !== 'CREAR') throw new Error(`se esperaba una creación, llegó ${r.modo}`);
  return r;
}

function serieHora(
  r: ResultadoFormulario,
): Extract<ResultadoFormulario, { modo: 'EDITAR_HORA_FUTURAS' }> {
  if (r.modo !== 'EDITAR_HORA_FUTURAS') throw new Error(`se esperaba una serie, llegó ${r.modo}`);
  return r;
}

describe('A3 · ActividadFormularioComponent', () => {
  let fixture: ComponentFixture<ActividadFormularioComponent>;
  let componente: ActividadFormularioComponent;
  let http: HttpTestingController;
  let guardadas: ResultadoFormulario[];
  let cerrados: number;

  async function asentar(): Promise<void> {
    for (let i = 0; i < 4; i++) {
      await Promise.resolve();
      TestBed.tick();
    }
  }

  function altas(): TestRequest[] {
    return http.match(r => r.method === 'POST' && r.url.endsWith('/actividades'));
  }

  function ediciones(): TestRequest[] {
    return http.match(r => r.method === 'PATCH' && /\/actividades\/[^/]+$/.test(r.url));
  }

  /** `PATCH /actividades/:id/esta-y-siguientes/hora` — la única colectiva del formulario. */
  function horasDeSerie(): TestRequest[] {
    return http.match(
      r => r.method === 'PATCH' && r.url.endsWith('/esta-y-siguientes/hora'),
    );
  }

  /** Descarta lo que piden los recursos auxiliares (búsqueda, leads del cliente). */
  function drenarAuxiliares(): void {
    for (const r of http.match(() => true)) {
      if (r.request.method === 'GET') r.flush({ datos: [], total: 0, pagina: 1, limite: 10, totalPaginas: 1 });
    }
  }

  async function montar(contexto: ContextoFormulario): Promise<void> {
    fixture = TestBed.createComponent(ActividadFormularioComponent);
    fixture.componentRef.setInput('contexto', contexto);
    componente = fixture.componentInstance;
    componente.guardada.subscribe(r => guardadas.push(r));
    componente.cerrado.subscribe(() => (cerrados += 1));
    fixture.detectChanges();
    await asentar();
    drenarAuxiliares();
    await asentar();
  }

  beforeEach(() => {
    TestBed.resetTestingModule();
    vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: () => undefined }));
    guardadas = [];
    cerrados = 0;
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    fixture?.destroy();
    TestBed.resetTestingModule();
    vi.unstubAllGlobals();
  });

  it('Crear · compone el mismo payload de siempre', async () => {
    await montar({ modo: 'CREAR', cliente: CLIENTE });

    componente['formTitulo'].set('Llamar la semana que viene');
    componente['formTipo'].set('LLAMADA');
    componente['formDuracion'].set(15);
    componente['formFecha'].set('2026-09-27T10:30');
    const guardado = componente['guardar'](new Event('submit'));
    await asentar();

    const alta = altas();
    expect(alta).toHaveLength(1);
    const body = alta[0].request.body;
    expect(body.tipo).toBe('LLAMADA');
    expect(body.titulo).toBe('Llamar la semana que viene');
    expect(body.clienteId).toBe(CLIENTE.id);
    expect(body.duracionMinutos).toBe(15);
    expect(body.fechaProgramada).toBe(new Date('2026-09-27T10:30').toISOString());
    /* Sin repetición no viaja el campo: es el payload que el backend ya recibía. */
    expect(body.repetir).toBeUndefined();

    alta[0].flush(actividad('nueva'));
    await guardado;
    expect(guardadas).toHaveLength(1);
    expect(guardadas[0].modo).toBe('CREAR');
    expect(creacion(guardadas[0]).vecesAgendadas).toBe(1);
  });

  it('Crear con repetición · manda frecuencia y veces, y las reporta', async () => {
    await montar({ modo: 'CREAR', cliente: CLIENTE });

    componente['formTitulo'].set('Seguimiento mensual');
    componente['formRepetir'].set('MENSUAL');
    componente['formRepetirVeces'].set(3);
    const guardado = componente['guardar'](new Event('submit'));
    await asentar();

    const alta = altas();
    expect(alta[0].request.body.repetir).toEqual({ frecuencia: 'MENSUAL', veces: 3 });
    alta[0].flush(actividad('nueva'));
    await guardado;
    expect(creacion(guardadas[0]).vecesAgendadas).toBe(3);
  });

  it('Editar · arranca con los datos de la actividad y manda un PATCH equivalente', async () => {
    const existente = actividad('la-que-edito');
    await montar({ modo: 'EDITAR', actividad: existente });

    // El formulario llega sembrado con lo que había.
    expect(componente['formTitulo']()).toBe('Llamar a la paciente');
    expect(componente['formTipo']()).toBe('LLAMADA');
    expect(componente['formNotas']()).toBe('Confirmar hora');
    expect(componente['formDuracion']()).toBe(45);
    expect(componente['seleccion']()?.cliente.id).toBe(CLIENTE.id);

    componente['formTitulo'].set('Llamar a la paciente (reagendada)');
    const guardado = componente['guardar'](new Event('submit'));
    await asentar();

    const patch = ediciones();
    expect(patch).toHaveLength(1);
    expect(patch[0].request.url).toContain(existente.id);
    expect(patch[0].request.body.titulo).toBe('Llamar a la paciente (reagendada)');
    /* Editar nunca manda repetición: crear filas nuevas no es editar una. */
    expect(patch[0].request.body.repetir).toBeUndefined();

    patch[0].flush({ ...existente, titulo: 'Llamar a la paciente (reagendada)' });
    await guardado;
    expect(guardadas[0].modo).toBe('EDITAR');
  });

  it('Cancelar · cerrar el cajón avisa, y no emite ningún guardado', async () => {
    await montar({ modo: 'CREAR', cliente: CLIENTE });

    componente.cerrado.emit();
    await asentar();

    expect(cerrados).toBe(1);
    expect(guardadas).toHaveLength(0);
    expect(altas()).toHaveLength(0);
  });

  it('Error · conserva lo escrito para poder reintentar', async () => {
    await montar({ modo: 'CREAR', cliente: CLIENTE });

    componente['formTitulo'].set('Llamar la semana que viene');
    const guardado = componente['guardar'](new Event('submit'));
    await asentar();
    altas()[0].flush('boom', { status: 500, statusText: 'Server Error' });
    await guardado;
    await asentar();

    expect(guardadas, 'un fallo no puede anunciarse como guardado').toHaveLength(0);
    expect(componente['errorForm']()).not.toBe('');
    expect(componente['formTitulo']()).toBe('Llamar la semana que viene');
    expect(componente['seleccion']()?.cliente.id).toBe(CLIENTE.id);
    expect(componente['guardando']()).toBe(false);
  });

  it('Doble submit · no crea dos actividades', async () => {
    await montar({ modo: 'CREAR', cliente: CLIENTE });

    componente['formTitulo'].set('Llamar la semana que viene');
    const primero = componente['guardar'](new Event('submit'));
    const segundo = componente['guardar'](new Event('submit'));
    await asentar();

    const alta = altas();
    expect(alta).toHaveLength(1);
    alta[0].flush(actividad('nueva'));
    await Promise.all([primero, segundo]);
    expect(guardadas).toHaveLength(1);
  });

  it('Validación · sin título no sale ninguna petición', async () => {
    await montar({ modo: 'CREAR', cliente: CLIENTE });

    componente['formTitulo'].set('ab');
    await componente['guardar'](new Event('submit'));
    await asentar();

    expect(altas()).toHaveLength(0);
    expect(componente['errorForm']()).toContain('3 caracteres');
  });

  it('Validación · sin paciente no sale ninguna petición', async () => {
    await montar({ modo: 'CREAR' });

    componente['formTitulo'].set('Una tarea suelta');
    await componente['guardar'](new Event('submit'));
    await asentar();

    expect(altas()).toHaveLength(0);
    expect(componente['errorForm']()).toContain('cliente');
  });
  /**
   * A5.3 · «esta y las siguientes», solo para un cambio de hora puro.
   *
   * El backend sabe propagar UNA cosa: la hora, respetando el día de cada
   * ocurrencia. Ni el título, ni las notas, ni el tipo, ni la duración, ni el
   * paciente, ni el día. Así que la pregunta que resuelven estas pruebas no es
   * «¿se propagó bien?» —eso ya se probó contra PostgreSQL en A5.2— sino
   * «¿ofrece la interfaz exactamente lo que el backend puede cumplir?».
   *
   * Las fechas se escriben con `aDatetimeLocal`, que es lo que un
   * `<input type="datetime-local">` produce en la máquina que corre la prueba.
   * Así el INSTANTE que se quiere probar es el mismo en cualquier zona, y lo
   * que se está midiendo es la regla, no el reloj del portátil.
   */
  describe('A5.3 · alcance de la edición', () => {
    /* Martes 16/09/2026 en La Paz. En UTC estos dos instantes caen en días
       DISTINTOS (el 16 y el 17) y siguen siendo el mismo martes de la clínica:
       es la frontera donde una comparación con la zona del navegador se
       equivoca. */
    const MARTES_1930 = new Date('2026-09-16T23:30:00.000Z');
    const MARTES_2130 = new Date('2026-09-17T01:30:00.000Z');

    function deSerie(fecha: Date, parcial: Partial<Actividad> = {}): Actividad {
      return actividad('la-de-la-serie', {
        fechaProgramada: fecha.toISOString(),
        serieId: 'serie-1',
        frecuenciaSerie: 'SEMANAL',
        ...parcial,
      });
    }

    it('solo cambia la hora · ofrece las dos opciones', async () => {
      await montar({ modo: 'EDITAR', actividad: deSerie(MARTES_1930) });

      componente['formFecha'].set(aDatetimeLocal(MARTES_2130));
      await asentar();

      expect(componente['cambioDeHoraPura']()).toBe('21:30');
      /* Y arranca en «solo esta»: propagar es la excepción, no el defecto. */
      expect(componente['alcanceEdicion']()).toBe('SOLO_ESTA');
    });

    it('frontera UTC/Bolivia · el mismo día de clínica en dos días de UTC', async () => {
      /* Con la zona del navegador puesta en UTC, estos dos instantes son el 16
         y el 17: «cambió el día», y la propagación no se habría ofrecido nunca
         a quien edita una actividad de la tarde-noche. La decisión es de
         `America/La_Paz`. */
      expect(MARTES_1930.toISOString().slice(0, 10)).toBe('2026-09-16');
      expect(MARTES_2130.toISOString().slice(0, 10)).toBe('2026-09-17');

      await montar({ modo: 'EDITAR', actividad: deSerie(MARTES_1930) });
      componente['formFecha'].set(aDatetimeLocal(MARTES_2130));
      await asentar();

      expect(componente['cambioDeHoraPura']()).toBe('21:30');
    });

    it('frontera UTC/Bolivia · cruzar la medianoche boliviana SÍ cambia de día', async () => {
      /* 16/09 23:30 y 17/09 00:30 en La Paz: los dos caen el 17 en UTC, así que
         una comparación en UTC diría «mismo día» y ofrecería propagar un cambio
         que en realidad movió la actividad de día. */
      const antes = new Date('2026-09-17T03:30:00.000Z');
      const despues = new Date('2026-09-17T04:30:00.000Z');
      expect(antes.toISOString().slice(0, 10)).toBe(despues.toISOString().slice(0, 10));

      await montar({ modo: 'EDITAR', actividad: deSerie(antes) });
      componente['formFecha'].set(aDatetimeLocal(despues));
      await asentar();

      expect(componente['cambioDeHoraPura']()).toBeNull();
    });

    it('Solo esta · un PATCH individual, y ninguno de serie', async () => {
      await montar({ modo: 'EDITAR', actividad: deSerie(MARTES_1930) });

      componente['formFecha'].set(aDatetimeLocal(MARTES_2130));
      await asentar();
      componente['alcanceEdicion'].set('SOLO_ESTA');

      const guardado = componente['guardar'](new Event('submit'));
      await asentar();

      expect(horasDeSerie(), 'nadie pidió tocar las siguientes').toHaveLength(0);
      const patch = ediciones();
      expect(patch).toHaveLength(1);
      expect(patch[0].request.body.fechaProgramada).toBe(MARTES_2130.toISOString());

      patch[0].flush(deSerie(MARTES_2130));
      await guardado;
      expect(guardadas[0].modo).toBe('EDITAR');
    });

    it('Esta y las siguientes · UNA sola escritura, la colectiva, con HH:MM', async () => {
      await montar({ modo: 'EDITAR', actividad: deSerie(MARTES_1930) });

      componente['formFecha'].set(aDatetimeLocal(MARTES_2130));
      await asentar();
      componente['alcanceEdicion'].set('FUTURAS');

      const guardado = componente['guardar'](new Event('submit'));
      await asentar();

      const serie = horasDeSerie();
      expect(serie).toHaveLength(1);
      expect(serie[0].request.url).toContain('la-de-la-serie');
      expect(serie[0].request.body).toEqual({ hora: '21:30' });
      /* La elegida YA va dentro de «esta y las siguientes»: mandarle además el
         PATCH individual sería escribirle dos veces la misma intención, y dejar
         medio aplicado lo que se pidió entero si la segunda falla. */
      expect(ediciones(), 'una intención, una escritura').toHaveLength(0);

      serie[0].flush({ afectadas: 4 });
      await asentar();
      /* Y tampoco DESPUÉS de responder la colectiva: se comprueba en los dos
         momentos a propósito, porque una segunda escritura encadenada no se ve
         antes del flush y dejaría la prueba colgada en vez de acusarla. */
      expect(ediciones(), 'tampoco una individual encadenada detrás').toHaveLength(0);

      await guardado;
      expect(serieHora(guardadas[0]).afectadas).toBe(4);
    });

    it('cambiar de DÍA nunca ofrece propagar, aunque sea de una serie', async () => {
      await montar({ modo: 'EDITAR', actividad: deSerie(MARTES_1930) });

      /* Lunes 09:00 → martes 09:00: el backend no sabe mover el día de una
         serie, y no hay desplazamiento que calcular aquí. */
      componente['formFecha'].set(aDatetimeLocal(new Date('2026-09-17T23:30:00.000Z')));
      await asentar();

      expect(componente['cambioDeHoraPura']()).toBeNull();
      expect(componente['alcanceEdicion']()).toBe('SOLO_ESTA');
    });

    it('si además cambia otro campo, deja de ser un cambio de hora', async () => {
      await montar({ modo: 'EDITAR', actividad: deSerie(MARTES_1930) });
      componente['formFecha'].set(aDatetimeLocal(MARTES_2130));
      await asentar();
      expect(componente['cambioDeHoraPura'](), 'de partida sí es propagable').toBe('21:30');

      for (const tocar of [
        () => componente['formNotas'].set('Traer resultados de laboratorio'),
        () => componente['formTitulo'].set('Llamar a la paciente otra vez'),
        () => componente['formTipo'].set('REUNION'),
        () => componente['formDuracion'].set(90),
      ]) {
        await montar({ modo: 'EDITAR', actividad: deSerie(MARTES_1930) });
        componente['formFecha'].set(aDatetimeLocal(MARTES_2130));
        tocar();
        await asentar();
        expect(componente['cambioDeHoraPura']()).toBeNull();
      }
    });

    it('elegir FUTURAS y luego escribir una nota vuelve a «solo esta», y guarda una sola vez', async () => {
      await montar({ modo: 'EDITAR', actividad: deSerie(MARTES_1930) });
      componente['formFecha'].set(aDatetimeLocal(MARTES_2130));
      await asentar();
      componente['alcanceEdicion'].set('FUTURAS');

      componente['formNotas'].set('Traer resultados de laboratorio');
      await asentar();

      /* La opción desapareció, así que la elección no puede quedarse esperando
         escondida: sería propagar algo que la agente ya no está pidiendo. */
      expect(componente['alcanceEdicion']()).toBe('SOLO_ESTA');

      const guardado = componente['guardar'](new Event('submit'));
      await asentar();
      expect(horasDeSerie()).toHaveLength(0);
      const patch = ediciones();
      expect(patch).toHaveLength(1);
      expect(patch[0].request.body.notas).toBe('Traer resultados de laboratorio');
      patch[0].flush(deSerie(MARTES_2130));
      await guardado;
    });

    it('una actividad suelta nunca ofrece propagar', async () => {
      await montar({ modo: 'EDITAR', actividad: actividad('suelta') });

      componente['formFecha'].set(aDatetimeLocal(new Date('2026-09-20T18:30:00.000Z')));
      await asentar();

      expect(componente['cambioDeHoraPura']()).toBeNull();
    });

    it('una de serie ya COMPLETADA tampoco: el backend la rechazaría', async () => {
      await montar({
        modo: 'EDITAR',
        actividad: deSerie(MARTES_1930, { estado: 'COMPLETADA' }),
      });

      componente['formFecha'].set(aDatetimeLocal(MARTES_2130));
      await asentar();

      expect(componente['cambioDeHoraPura']()).toBeNull();
    });

    it('la misma hora no es un cambio de hora', async () => {
      await montar({ modo: 'EDITAR', actividad: deSerie(MARTES_1930) });

      componente['formFecha'].set(aDatetimeLocal(MARTES_1930));
      await asentar();

      expect(componente['cambioDeHoraPura']()).toBeNull();
    });

    it('si la colectiva falla, no se anuncia nada y se puede reintentar', async () => {
      await montar({ modo: 'EDITAR', actividad: deSerie(MARTES_1930) });
      componente['formFecha'].set(aDatetimeLocal(MARTES_2130));
      await asentar();
      componente['alcanceEdicion'].set('FUTURAS');

      const guardado = componente['guardar'](new Event('submit'));
      await asentar();
      horasDeSerie()[0].flush('boom', { status: 500, statusText: 'Server Error' });
      await guardado;
      await asentar();

      expect(guardadas, 'un fallo no puede anunciarse como guardado').toHaveLength(0);
      expect(componente['errorForm']()).not.toBe('');
      expect(componente['guardando']()).toBe(false);
      /* Y la elección sigue donde estaba: reintentar es volver a pulsar. */
      expect(componente['alcanceEdicion']()).toBe('FUTURAS');
    });
  });
});
