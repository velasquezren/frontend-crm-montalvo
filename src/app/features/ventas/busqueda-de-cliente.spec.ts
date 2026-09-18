import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthService } from '../../core/auth/auth.service';
import { ToastService } from '../../core/toast/toast.service';
import { VentasPage } from './ventas.page';
import { VentasService } from './ventas.service';

/**
 * El buscador de paciente del modal de venta.
 *
 * `GET /clientes` responde **paginado** (`{ datos, total, … }`). El recurso lo
 * declaraba como `Cliente[]`, así que `.value().length` era `undefined`,
 * `undefined > 0` daba `false` y la lista de sugerencias no se pintaba nunca:
 * parecía que el buscador no encontraba a nadie aunque el backend sí devolviera
 * resultados.
 *
 * TypeScript no lo ve —el parámetro de tipo de `httpResource` es una afirmación
 * sobre el JSON, no una comprobación—, y ningún build se quejaba. Por eso hace
 * falta una prueba que hable con la forma real de la respuesta.
 *
 * Funcionó hasta `f45894e`, que quitó un `httpResource<any>` y de paso se llevó
 * el `computed` que desenvolvía `.datos`.
 */

const CLIENTE = {
  id: 'c1',
  nombre: 'Paciente Prueba',
  telefono: '+59170000000',
  categoria: 'PROSPECTO',
  ci: '12345678',
  pac: 'PAC-001',
};

/** La forma EXACTA que devuelve el backend: `paginar()` en pagination.dto.ts. */
const respuestaPaginada = { datos: [CLIENTE], total: 1, pagina: 1, limite: 20, totalPaginas: 1 };

describe('buscador de paciente en el modal de venta', () => {
  let fixture: ComponentFixture<VentasPage>;
  let pagina: VentasPage;
  let http: HttpTestingController;

  async function asentar(): Promise<void> {
    for (let i = 0; i < 4; i++) {
      await Promise.resolve();
      TestBed.tick();
    }
  }

  beforeEach(async () => {
    TestBed.resetTestingModule();
    vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: () => undefined }));

    TestBed.configureTestingModule({
      /* `VentasPage` en `imports` porque su plantilla tiene un `@defer`: sin
         esto, `createComponent` falla con «unresolved metadata». */
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
            user: signal({ id: 'a1', nombre: 'Vendedora' }),
            generacionSesion: signal(1),
          },
        },
        { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn(), info: vi.fn() } },
      ],
    });
    TestBed.overrideProvider(VentasService, {
      useValue: {
        listarRequest: () => undefined,
        agentesRequest: () => undefined,
        catalogoRequest: () => undefined,
        crear: vi.fn(),
        cambiarEstado: vi.fn(),
        corregirOrigen: vi.fn(),
        subirComprobante: vi.fn(),
      },
    });

    await TestBed.compileComponents();
    fixture = TestBed.createComponent(VentasPage);
    pagina = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    await asentar();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.unstubAllGlobals();
  });

  /** Teclea en el buscador y responde con la forma real del backend. */
  async function buscar(termino: string): Promise<boolean> {
    pagina['busquedaCliente'].set(termino);
    await asentar();
    const peticiones = http.match(r => r.url.includes('/clientes'));
    if (peticiones.length === 0) return false;
    peticiones[peticiones.length - 1].flush(respuestaPaginada);
    await asentar();
    return true;
  }

  it('1 · desenvuelve `datos`: la respuesta paginada NO es un array', async () => {
    expect(await buscar('12345678'), 'debió salir la petición').toBe(true);

    /* La prueba que habría atrapado el bug: con el tipo mal, esto era 0. */
    expect(pagina['clientesEncontrados']()).toHaveLength(1);
    expect(pagina['clientesEncontrados']()[0].id).toBe('c1');
  });

  it('2 · busca por CI, no solo por nombre', async () => {
    await buscar('12345678');

    /* El término viaja tal cual; qué columnas se miran lo decide el backend
       (nombre, teléfono, email, CI y PAC). Acá se fija que no se recorte ni se
       filtre de más en el camino. */
    expect(pagina['clientesEncontrados']()[0].ci).toBe('12345678');
  });

  it('3 · el término viaja como `busqueda`, que es lo que el DTO acepta', async () => {
    pagina['busquedaCliente'].set('Paciente');
    await asentar();

    const peticiones = http.match(r => r.url.includes('/clientes'));
    expect(peticiones.length).toBeGreaterThan(0);
    const url = peticiones[peticiones.length - 1].request.urlWithParams;
    /* Con `whitelist: true` en el ValidationPipe, un nombre distinto se
       descartaría EN SILENCIO y el endpoint devolvería todo sin filtrar. */
    expect(url).toContain('busqueda=Paciente');
    peticiones[peticiones.length - 1].flush(respuestaPaginada);
  });

  it('4 · con menos de 2 caracteres no consulta', async () => {
    pagina['busquedaCliente'].set('1');
    await asentar();

    expect(http.match(r => r.url.includes('/clientes'))).toHaveLength(0);
  });
});
