import '@angular/compiler';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting, TestRequest } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

function actividad(id: string): Actividad {
  return {
    id, tipo: 'LLAMADA', titulo: 'Llamar a la paciente', notas: 'Confirmar hora',
    fechaProgramada: '2026-09-20T14:00:00.000Z', duracionMinutos: 45, estado: 'PENDIENTE',
    completadaEn: null, notificadaEn: null, createdAt: '2026-09-01T12:00:00.000Z',
    cliente: CLIENTE, agente: { id: 'u1', nombre: 'Agente' },
  } as unknown as Actividad;
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
    expect(guardadas[0].vecesAgendadas).toBe(1);
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
    expect(guardadas[0].vecesAgendadas).toBe(3);
  });

  it('Editar · arranca con los datos de la actividad y manda un PATCH equivalente', async () => {
    const existente = actividad('la-que-edito');
    await montar({ modo: 'EDITAR', actividad: existente });

    // El formulario llega sembrado con lo que había.
    expect(componente['formTitulo']()).toBe('Llamar a la paciente');
    expect(componente['formTipo']()).toBe('LLAMADA');
    expect(componente['formNotas']()).toBe('Confirmar hora');
    expect(componente['formDuracion']()).toBe(45);
    expect(componente['clienteElegido']()?.id).toBe(CLIENTE.id);

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
    expect(componente['clienteElegido']()?.id).toBe(CLIENTE.id);
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
});
