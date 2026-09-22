import '@angular/compiler';
import { AuthService } from '../../../../core/auth/auth.service';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting, TestRequest } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  SeleccionPaciente,
  SelectorClienteExpressComponent,
} from './selector-cliente-express.component';

/**
 * A4.1 · el selector de paciente y su alta express.
 *
 * Lo que aquí se prueba es lo que el componente posee: buscar, elegir, soltar,
 * los leads y el alta. Lo que NO se prueba aquí es qué se hace después con esa
 * selección —agendar, completar, repetir—: eso es del formulario y de la página.
 *
 * Las dos últimas pruebas son las que sostienen la unificación: el botón
 * «Registrar» y el atajo de guardar sin pulsarlo comparten mecánica, y si
 * alguien deja una copia escondida, las dos caen a la vez.
 */

const ANA = { id: 'c-ana', nombre: 'Ana Rojas', telefono: '+59171111111' };
const BETO = { id: 'c-beto', nombre: 'Beto Vera', telefono: '+59172222222' };

describe('A4.1 · SelectorClienteExpressComponent', () => {
  let fixture: ComponentFixture<SelectorClienteExpressComponent>;
  let componente: SelectorClienteExpressComponent;
  let http: HttpTestingController;
  let emitidas: Array<SeleccionPaciente | null>;

  async function asentar(): Promise<void> {
    for (let i = 0; i < 4; i++) {
      await Promise.resolve();
      TestBed.tick();
    }
  }

  function altasDeCliente(): TestRequest[] {
    return http.match(r => r.method === 'POST' && r.url.endsWith('/clientes'));
  }

  function busquedas(): TestRequest[] {
    return http.match(r => r.method === 'GET' && r.url.includes('/clientes'));
  }

  function responderLeads(datos: unknown[] = []): void {
    for (const r of http.match(r => r.url.includes('/leads'))) {
      r.flush({ datos, total: datos.length, pagina: 1, limite: 10, totalPaginas: 1 });
    }
  }

  async function montar(inicial: SeleccionPaciente | null = null, permite = true): Promise<void> {
    fixture = TestBed.createComponent(SelectorClienteExpressComponent);
    fixture.componentRef.setInput('seleccionInicial', inicial);
    fixture.componentRef.setInput('permiteCambiarPaciente', permite);
    componente = fixture.componentInstance;
    componente.seleccionCambiada.subscribe(s => emitidas.push(s));
    fixture.detectChanges();
    await asentar();
    responderLeads();
    await asentar();
  }

  beforeEach(() => {
    TestBed.resetTestingModule();
    vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: () => undefined }));
    emitidas = [];
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

  it('recepción busca pacientes de sus chats y los elige sin consultar leads ni ofrecer altas comerciales', async () => {
    vi.spyOn(TestBed.inject(AuthService), 'user').mockReturnValue({
      id: 'recepcion', nombre: 'Recepción', email: 'recepcion@test.local', rol: 'RECEPCION', iniciales: 'R', foto: null,
    });
    await montar();
    componente['busquedaCliente'].set('ana');
    await asentar();
    const consulta = http.expectOne(r => r.url.endsWith('/actividades/pacientes') && r.params.get('q') === 'ana');
    consulta.flush({ datos: [ANA], total: 1, pagina: 1, limite: 10, totalPaginas: 1 });
    await asentar();
    expect(fixture.nativeElement.textContent).toContain('Ana Rojas');
    expect(fixture.nativeElement.textContent).not.toContain('Nuevo paciente express');
    expect(fixture.nativeElement.textContent).not.toContain('Registrar nuevo contacto');
    componente['elegirCliente'](ANA);
    await asentar();
    expect(emitidas.at(-1)).toEqual({ cliente: ANA, leadId: null });
    http.expectNone(r => r.url.includes('/leads') || r.url.endsWith('/clientes'));
  });

  it('Búsqueda · desde dos caracteres pregunta al servidor y muestra lo que vuelve', async () => {
    await montar();

    componente['busquedaCliente'].set('a');
    await asentar();
    expect(busquedas(), 'con una sola letra no se molesta al servidor').toHaveLength(0);

    componente['busquedaCliente'].set('ana');
    await asentar();
    const consulta = busquedas();
    expect(consulta).toHaveLength(1);
    /* La forma EXACTA de `GET /clientes`: un sobre paginado, no un array.
       Esta prueba respondía con `[ANA]` y por eso estuvo verde mientras el
       buscador no mostraba a nadie en producción — el componente leía
       `.value().length` de un objeto, que es `undefined`. Una prueba que
       inventa la respuesta del servidor no prueba la integración, prueba el
       mock. */
    consulta[0].flush({ datos: [ANA], total: 1, pagina: 1, limite: 20, totalPaginas: 1 });
    await asentar();

    expect(componente['clientesEncontrados']().map(c => c.id)).toEqual([ANA.id]);
  });

  it('Selección · elegir un paciente lo publica hacia fuera', async () => {
    await montar();

    componente['elegirCliente'](ANA);
    await asentar();
    responderLeads();

    expect(emitidas.at(-1)).toEqual({ cliente: ANA, leadId: null });
    expect(componente['busquedaCliente'](), 'y el buscador queda con su nombre').toBe(ANA.nombre);
  });

  it('Cambio de paciente · el lead del anterior no se queda pegado', async () => {
    await montar({ cliente: ANA, leadId: 'lead-de-ana' });
    expect(emitidas.at(-1)).toEqual({ cliente: ANA, leadId: 'lead-de-ana' });

    componente['elegirCliente'](BETO);
    await asentar();
    responderLeads();

    expect(emitidas.at(-1), 'el lead de Ana no puede viajar con Beto').toEqual({
      cliente: BETO,
      leadId: null,
    });
  });

  it('Contexto inicial · arranca con el paciente y el lead que le dan (A2)', async () => {
    await montar({ cliente: ANA, leadId: 'lead-1' });

    expect(componente['clienteElegido']()?.id).toBe(ANA.id);
    expect(componente['leadId']()).toBe('lead-1');
    expect(emitidas.at(-1)).toEqual({ cliente: ANA, leadId: 'lead-1' });
  });

  it('Leads · solo se ofrecen los abiertos, y elegir uno se publica', async () => {
    await montar();
    componente['elegirCliente'](ANA);
    await asentar();
    for (const r of http.match(r => r.url.includes('/leads'))) {
      r.flush({
        datos: [
          { id: 'l-nuevo', estado: 'NUEVO', origen: 'WHATSAPP' },
          { id: 'l-contactado', estado: 'CONTACTADO', origen: 'META_ADS' },
          { id: 'l-ganado', estado: 'GANADO', origen: 'WHATSAPP' },
          { id: 'l-perdido', estado: 'PERDIDO', origen: 'WHATSAPP' },
        ],
        total: 4, pagina: 1, limite: 10, totalPaginas: 1,
      });
    }
    await asentar();

    /* «Abierto» es NUEVO o CONTACTADO. Ganado y perdido no son una opción de
       seguimiento: es la regla que ya existía y no se toca. */
    expect(componente['leadsAbiertosDelCliente']().map(l => l.id)).toEqual(['l-nuevo', 'l-contactado']);

    componente['elegirLead']('l-nuevo');
    await asentar();
    expect(emitidas.at(-1)).toEqual({ cliente: ANA, leadId: 'l-nuevo' });
  });

  it('Editar · con el paciente fijo no se ofrece cambiarlo ni registrar otro', async () => {
    await montar({ cliente: ANA, leadId: null }, false);
    fixture.detectChanges();

    const html = (fixture.nativeElement as HTMLElement).innerHTML;
    expect(html).not.toContain('Cambiar cliente');
    expect(html).not.toContain('Registrar nuevo');
  });

  it('Alta express válida · registra y deja al paciente elegido', async () => {
    await montar();
    componente['activarModoNuevoCliente']('Mariana López');
    componente['nuevoClienteTelefono'].set('71234567');

    const registro = componente['registrarNuevoClienteExpress']();
    await asentar();

    const alta = altasDeCliente();
    expect(alta).toHaveLength(1);
    // 8 dígitos locales se normalizan a internacional, como siempre.
    expect(alta[0].request.body).toEqual({ nombre: 'Mariana López', telefono: '+59171234567' });
    alta[0].flush({ id: 'c-nueva', nombre: 'Mariana López', telefono: '+59171234567' });
    await registro;
    await asentar();
    responderLeads();

    expect(componente['clienteElegido']()?.id).toBe('c-nueva');
    expect(componente['modoNuevoCliente'](), 'y la tarjeta de alta se cierra').toBe(false);
    expect(emitidas.at(-1)?.cliente.id).toBe('c-nueva');
  });

  it('Alta express inválida · no sale ninguna petición', async () => {
    await montar();
    componente['activarModoNuevoCliente']('A');
    componente['nuevoClienteTelefono'].set('123');

    await componente['registrarNuevoClienteExpress']();
    await asentar();

    expect(altasDeCliente()).toHaveLength(0);
    expect(componente['errorNuevoCliente']()).toContain('2 caracteres');
  });

  it('Error del servidor · conserva lo escrito para corregir y reintentar', async () => {
    await montar();
    componente['activarModoNuevoCliente']('Mariana López');
    componente['nuevoClienteTelefono'].set('71234567');

    const registro = componente['registrarNuevoClienteExpress']();
    await asentar();
    altasDeCliente()[0].flush('boom', { status: 500, statusText: 'Server Error' });
    await registro;
    await asentar();

    expect(componente['errorNuevoCliente']()).not.toBe('');
    expect(componente['nuevoClienteNombre']()).toBe('Mariana López');
    expect(componente['nuevoClienteTelefono']()).toBe('71234567');
    expect(componente['modoNuevoCliente'](), 'la tarjeta sigue abierta').toBe(true);
    expect(componente['creandoCliente']()).toBe(false);
  });

  /* ── Los dos caminos, ya sobre una sola mecánica ─────────────────────── */

  it('Camino 1 · el botón «Registrar» avisa por campo y celebra con un toast', async () => {
    await montar();
    componente['activarModoNuevoCliente']('Mariana López');
    componente['nuevoClienteTelefono'].set('no-es-un-telefono');

    await componente['registrarNuevoClienteExpress']();
    await asentar();

    /* Su redacción es distinta de la del atajo, y eso se conserva: aquí se dice
       QUÉ campo está mal. */
    expect(componente['errorNuevoCliente']()).toContain('celular válido');
    expect(altasDeCliente()).toHaveLength(0);
  });

  it('Camino 2 · resolverSeleccion termina el alta a medias de quien va a guardar', async () => {
    await montar();
    componente['activarModoNuevoCliente']('Mariana López');
    componente['nuevoClienteTelefono'].set('71234567');

    // Nadie pulsó «Registrar»: se va directo a guardar.
    const resolucion = componente.resolverSeleccion();
    await asentar();
    const alta = altasDeCliente();
    expect(alta).toHaveLength(1);
    expect(alta[0].request.body).toEqual({ nombre: 'Mariana López', telefono: '+59171234567' });
    alta[0].flush({ id: 'c-nueva', nombre: 'Mariana López', telefono: '+59171234567' });

    const resultado = await resolucion;
    expect(resultado.ok).toBe(true);
    expect(resultado.ok && resultado.seleccion.cliente.id).toBe('c-nueva');
  });

  it('Camino 2 · sin alta abierta y sin paciente, lo dice y no pide nada', async () => {
    await montar();

    const resultado = await componente.resolverSeleccion();

    expect(resultado).toEqual({ ok: false, motivo: 'SIN_PACIENTE' });
    expect(altasDeCliente()).toHaveLength(0);
  });

  it('Camino 2 · con paciente ya elegido devuelve su selección sin pedir nada', async () => {
    await montar({ cliente: ANA, leadId: 'lead-1' });

    const resultado = await componente.resolverSeleccion();

    expect(resultado).toEqual({ ok: true, seleccion: { cliente: ANA, leadId: 'lead-1' } });
    expect(altasDeCliente()).toHaveLength(0);
  });
});
