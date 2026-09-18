import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthService } from '../../core/auth/auth.service';
import { ToastService } from '../../core/toast/toast.service';
import { Lead } from '../leads/lead.model';
import { LeadsService } from '../leads/leads.service';
import { Venta } from './venta.model';
import { VentasPage } from './ventas.page';
import { VentasService } from './ventas.service';

/**
 * Corregir de qué lead vino una venta ya registrada — CAMP-1.
 *
 * Desde CAMP-1 `Venta.leadId` es dato de atribución: alimenta
 * `Venta → Lead → anuncioId`, que es lo que dirá de qué anuncio vino el dinero.
 * Antes de esto, equivocarse entre dos leads no tenía más arreglo que un UPDATE
 * a mano en producción.
 *
 * Lo que se fija aquí es el comportamiento, no el aspecto: qué se pide, qué se
 * guarda y —sobre todo— qué NO cambia cuando el backend dice que no.
 */

function ventaCon(lead: Venta['lead']): Venta {
  return {
    id: 'venta-1',
    producto: 'Botox',
    monto: '1200',
    estado: 'GANADA',
    cliente: { id: 'cliente-1', nombre: 'Paciente', telefono: '+59170000000' },
    agente: { id: 'agente-1', nombre: 'Vendedora' },
    comision: null,
    leadId: lead?.id ?? null,
    lead,
    createdAt: '2026-09-10T12:00:00.000Z',
  };
}

function leadDe(id: string, estado: Lead['estado'], anuncioId?: string): Lead {
  return {
    id,
    origen: 'INSTAGRAM_MENSAJE',
    estado,
    cliente: { id: 'cliente-1', nombre: 'Paciente', telefono: '+59170000000', categoria: 'PROSPECTO' },
    agente: null,
    anuncioId: anuncioId ?? null,
    createdAt: '2026-09-01T12:00:00.000Z',
  };
}

describe('CAMP-1 · corregir el origen de una venta registrada', () => {
  let fixture: ComponentFixture<VentasPage>;
  let pagina: VentasPage;

  /** Lo que devolverá el backend a la próxima corrección, o el error que dará. */
  let respuesta: { venta?: Venta; error?: unknown };
  let corregidas: Array<{ id: string; leadId: string | null }>;
  let leadsDevueltos: Lead[];
  let toastError: ReturnType<typeof vi.fn>;

  const ventasService = {
    listarRequest: () => undefined,
    agentesRequest: () => undefined,
    catalogoRequest: () => undefined,
    crear: vi.fn(),
    cambiarEstado: vi.fn(),
    subirComprobante: vi.fn(),
    corregirOrigen: (id: string, leadId: string | null) => {
      corregidas.push({ id, leadId });
      return respuesta.error ? Promise.reject(respuesta.error) : Promise.resolve(respuesta.venta!);
    },
  };

  /** Deja correr microtasks y efectos, como hace el navegador. */
  async function asentar(): Promise<void> {
    for (let i = 0; i < 4; i++) {
      await Promise.resolve();
      TestBed.tick();
    }
  }

  function abrir(venta: Venta): void {
    pagina['ventaSeleccionada'].set(venta);
  }

  beforeEach(async () => {
    TestBed.resetTestingModule();
    vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: () => undefined }));
    corregidas = [];
    respuesta = {};
    leadsDevueltos = [];
    toastError = vi.fn();

    TestBed.configureTestingModule({
      /* `VentasPage` va en `imports` aunque sea standalone: su plantilla tiene un
         `@defer`, así que Angular le emite metadata ASÍNCRONA, y
         `compileComponents()` solo resuelve la de los tipos que el TestBed
         conoce. Sin esta línea, `createComponent` falla con «unresolved
         metadata» por mucho que se llame a `compileComponents()`. */
      imports: [VentasPage],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          provide: AuthService,
          useValue: {
            isAdmin: signal(true),
            isSuperAdmin: signal(true),
            puedeGestionComercial: signal(true),
            user: signal({ id: 'agente-1', nombre: 'Vendedora' }),
            generacionSesion: signal(1),
          },
        },
        { provide: ToastService, useValue: { success: vi.fn(), error: toastError, info: vi.fn() } },
      ],
    });
    TestBed.overrideProvider(VentasService, { useValue: ventasService });
    TestBed.overrideProvider(LeadsService, {
      useValue: {
        listarRequest: () => undefined,
        /* El recurso de leads devuelve `undefined` como petición, así que nunca
           sale a la red; lo que la página ve se inyecta abajo a mano. Probar el
           transporte de `httpResource` no es lo de esta suite. */
      },
    });

    await TestBed.compileComponents();
    fixture = TestBed.createComponent(VentasPage);
    pagina = fixture.componentInstance;
    fixture.detectChanges();
    await asentar();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.unstubAllGlobals();
  });

  it('1 · la venta abierta conserva el lead que tiene', async () => {
    const lead = leadDe('lead-1', 'CONVERTIDO', '120211111');
    abrir(ventaCon({ id: lead.id, origen: lead.origen, anuncioId: lead.anuncioId }));
    await asentar();

    expect(pagina['ventaSeleccionada']()?.leadId).toBe('lead-1');
    expect(pagina['ventaSeleccionada']()?.lead?.origen).toBe('INSTAGRAM_MENSAJE');
    /* El panel arranca cerrado: abrir el detalle de una venta no es pedir
       corregirla. */
    expect(pagina['corrigiendoOrigen']()).toBe(false);
  });

  it('2 · cambiar a otro lead guarda y refleja lo que devolvió el backend', async () => {
    abrir(ventaCon({ id: 'lead-1', origen: 'INSTAGRAM_MENSAJE', anuncioId: null }));
    await asentar();
    respuesta = { venta: ventaCon({ id: 'lead-2', origen: 'FACEBOOK_LEAD_AD', anuncioId: '99' }) };

    await pagina['corregirOrigenDeLaVenta']('lead-2');
    await asentar();

    expect(corregidas).toEqual([{ id: 'venta-1', leadId: 'lead-2' }]);
    /* Se muestra la fila que confirmó el servidor, no la que se pulsó. */
    expect(pagina['ventaSeleccionada']()?.leadId).toBe('lead-2');
    expect(pagina['ventaSeleccionada']()?.lead?.anuncioId).toBe('99');
    expect(pagina['corrigiendoOrigen']()).toBe(false);
  });

  it('3 · quitar la atribución manda null, no omite el campo', async () => {
    abrir(ventaCon({ id: 'lead-1', origen: 'INSTAGRAM_MENSAJE', anuncioId: null }));
    await asentar();
    respuesta = { venta: ventaCon(null) };

    await pagina['corregirOrigenDeLaVenta'](null);
    await asentar();

    /* `null` explícito: el backend rechaza el cuerpo vacío a propósito, para
       que un bug del cliente no borre una atribución en silencio. */
    expect(corregidas).toEqual([{ id: 'venta-1', leadId: null }]);
    expect(pagina['ventaSeleccionada']()?.leadId).toBeNull();
  });

  it('4 · abrir el panel con varios leads no elige nada por su cuenta', async () => {
    leadsDevueltos = [leadDe('lead-1', 'CONVERTIDO'), leadDe('lead-2', 'NUEVO')];
    abrir(ventaCon({ id: 'lead-1', origen: 'INSTAGRAM_MENSAJE', anuncioId: null }));
    await asentar();

    pagina['alternarCorreccionOrigen']();
    await asentar();

    expect(pagina['corrigiendoOrigen']()).toBe(true);
    /* Lo importante: mirar las opciones no cambia la atribución. Con dos leads
       no hay forma de saber cuál es el bueno, y elegir por la agente sería
       inventarse de qué anuncio vino el dinero. */
    expect(corregidas).toEqual([]);
    expect(pagina['ventaSeleccionada']()?.leadId).toBe('lead-1');
    expect(leadsDevueltos).toHaveLength(2);
  });

  it('5 · si el backend falla, la interfaz NO finge que guardó', async () => {
    const original = ventaCon({ id: 'lead-1', origen: 'INSTAGRAM_MENSAJE', anuncioId: '111' });
    abrir(original);
    pagina['alternarCorreccionOrigen']();
    await asentar();
    respuesta = { error: new Error('500') };

    await pagina['corregirOrigenDeLaVenta']('lead-2');
    await asentar();

    /* El origen a la vista sigue siendo el viejo y el panel sigue abierto: si
       se cerrara, la agente se iría convencida de haber corregido la
       atribución y nadie volvería a mirarlo. */
    expect(pagina['ventaSeleccionada']()?.leadId).toBe('lead-1');
    expect(pagina['corrigiendoOrigen']()).toBe(true);
    expect(toastError).toHaveBeenCalled();
    expect(pagina['guardandoOrigen']()).toBe(false);
  });
});
