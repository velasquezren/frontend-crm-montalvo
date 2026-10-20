import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, Params, provideRouter, Router } from '@angular/router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AuthService } from '../../core/auth/auth.service';
import { ToastService } from '../../core/toast/toast.service';
import { LeadsService } from '../leads/leads.service';
import { filtrosVentasAUrl, filtrosVentasDeUrl, VentasPage } from './ventas.page';
import { FiltroVentas, VentasService } from './ventas.service';

/**
 * Los filtros de Ventas viven en la URL. Antes estaban solo en memoria: F5,
 * volver desde la ficha de un paciente o pasarle el enlace a otra persona
 * dejaba la lista sin filtrar.
 */
describe('Ventas: los filtros en la URL', () => {
  describe('lectura y escritura', () => {
    it('ida y vuelta conserva cada filtro', () => {
      const filtros = filtrosVentasDeUrl(convertToParamMap({
        vista: 'analitica', estado: 'GANADA', periodo: 'PERSONALIZADO', desde: '2026-10-01', hasta: '2026-10-15',
        agente: 'agente-2', pago: 'QR', comprobante: 'SIN_COMPROBANTE', modulo: 'Láser', q: 'ana',
      }));
      expect(filtros).toEqual({
        vista: 'analitica', estado: 'GANADA', periodo: 'PERSONALIZADO', desde: '2026-10-01', hasta: '2026-10-15',
        agenteId: 'agente-2', metodoPago: 'QR', comprobante: 'SIN_COMPROBANTE', modulo: 'Láser', q: 'ana',
      });
      expect(filtrosVentasDeUrl(convertToParamMap(filtrosVentasAUrl(filtros) as Params))).toEqual(filtros);
    });

    it('sin parámetros son los filtros por defecto, y escribirlos deja la URL limpia', () => {
      const porDefecto = filtrosVentasDeUrl(convertToParamMap({}));
      expect(porDefecto).toEqual({
        vista: 'tabla', estado: 'TODAS', periodo: 'TODAS', desde: '', hasta: '',
        agenteId: 'TODOS', metodoPago: 'TODOS', comprobante: 'TODOS', modulo: null, q: '',
      });
      expect(Object.values(filtrosVentasAUrl(porDefecto)).every(v => v === null)).toBe(true);
    });

    it('lo que no es un valor conocido cae al filtro por defecto', () => {
      const filtros = filtrosVentasDeUrl(convertToParamMap({
        vista: 'otra', estado: 'BORRADA', periodo: 'AYER', pago: 'BITCOIN', comprobante: 'quizas',
      }));
      expect(filtros).toMatchObject({ vista: 'tabla', estado: 'TODAS', periodo: 'TODAS', metodoPago: 'TODOS', comprobante: 'TODOS' });
    });

    it('las fechas solo cuentan con «Rango libre» y con forma de fecha', () => {
      expect(filtrosVentasDeUrl(convertToParamMap({ periodo: 'HOY', desde: '2026-10-01' })).desde).toBe('');
      expect(filtrosVentasDeUrl(convertToParamMap({ periodo: 'PERSONALIZADO', desde: '1/10/2026' })).desde).toBe('');
      const otroPeriodo = filtrosVentasAUrl({ ...filtrosVentasDeUrl(convertToParamMap({})), periodo: 'HOY', desde: '2026-10-01' });
      expect(otroPeriodo['desde']).toBeNull();
    });
  });

  describe('en la página', () => {
    let pedidos: FiltroVentas[];
    let navegar: ReturnType<typeof vi.spyOn>;

    async function asentar(): Promise<void> {
      for (let i = 0; i < 4; i++) {
        await Promise.resolve();
        TestBed.tick();
      }
    }

    async function montar(params: Params, esAdmin = true) {
      TestBed.resetTestingModule();
      vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: () => undefined }));
      pedidos = [];
      const query = convertToParamMap(params);
      TestBed.configureTestingModule({
        imports: [VentasPage],
        providers: [
          provideHttpClient(),
          provideHttpClientTesting(),
          provideRouter([]),
          { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: query, queryParams: params } } },
          {
            provide: AuthService,
            useValue: {
              isAdmin: signal(esAdmin),
              isSuperAdmin: signal(false),
              puedeGestionComercial: signal(true),
              user: signal({ id: 'agente-1', nombre: 'Vendedora' }),
              generacionSesion: signal(1),
            },
          },
          { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn(), info: vi.fn() } },
        ],
      });
      TestBed.overrideProvider(VentasService, {
        useValue: {
          listarRequest: (f: FiltroVentas) => { pedidos.push(f); return undefined; },
          resumenRequest: () => undefined,
          catalogoRequest: () => undefined,
        },
      });
      TestBed.overrideProvider(LeadsService, { useValue: { listarRequest: () => undefined } });
      navegar = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
      await TestBed.compileComponents();
      const fixture = TestBed.createComponent(VentasPage);
      fixture.detectChanges();
      await asentar();
      return fixture;
    }

    afterEach(() => {
      TestBed.resetTestingModule();
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
    });

    it('F5 con filtros pide la lista ya filtrada y no reescribe la URL', async () => {
      const fixture = await montar({ estado: 'PERDIDA', pago: 'EFECTIVO', q: 'ana' });
      expect(pedidos.at(-1)).toMatchObject({ estado: 'PERDIDA', metodoPago: 'EFECTIVO', q: 'ana' });
      expect(navegar).not.toHaveBeenCalled();
      fixture.destroy();
    });

    it('cambiar un filtro reemplaza la URL sin apilar historial', async () => {
      const fixture = await montar({});
      fixture.componentInstance['cambiarFiltro']('GANADA');
      await asentar();
      expect(navegar).toHaveBeenLastCalledWith([], expect.objectContaining({
        queryParams: expect.objectContaining({ estado: 'GANADA', pago: null }),
        queryParamsHandling: 'merge',
        replaceUrl: true,
      }));
      fixture.destroy();
    });

    it('un enlace con ?agente= no filtra a quien no es administrador', async () => {
      const fixture = await montar({ agente: 'agente-2' }, false);
      expect(pedidos.at(-1)?.agenteId).toBeUndefined();
      fixture.destroy();
    });

    it('cerrar el formulario quita solo sus parámetros: los filtros se quedan', async () => {
      const fixture = await montar({ estado: 'GANADA', nuevo: '1', clienteId: 'cliente-1', clienteNombre: 'Ana' });
      navegar.mockClear();
      fixture.componentInstance['cerrarFormulario']();
      expect(navegar).toHaveBeenCalledTimes(1);
      const [, extras] = navegar.mock.calls[0] as [unknown, { queryParams: Params; queryParamsHandling: string }];
      expect(extras.queryParamsHandling).toBe('merge');
      expect(extras.queryParams).toEqual({ nuevo: null, clienteId: null, clienteNombre: null, clienteTelefono: null, leadId: null });
      fixture.destroy();
    });
  });
});
