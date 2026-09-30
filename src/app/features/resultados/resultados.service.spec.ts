import '@angular/compiler';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { ResultadosService } from './resultados.service';

/**
 * Las acciones de la cola van SOBRE EL INFORME, por `/resultados`.
 *
 * Antes corregían la ficha por `/clientes`, que exige rango de agente: la
 * asistente —la persona para la que existe esta cola— recibía 403 al cambiar
 * un teléfono o crear una ficha. Si alguien vuelve a mandarlas a Clientes,
 * esto cae.
 */
describe('ResultadosService', () => {
  let servicio: ResultadosService;
  let http: HttpTestingController;
  const INFORME = '22222222-2222-4222-8222-222222222222';

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    servicio = TestBed.inject(ResultadosService);
    http = TestBed.inject(HttpTestingController);
  });

  it('corrige el teléfono sobre el informe y solo manda el teléfono', async () => {
    const hecho = servicio.corregirTelefono(INFORME, '+59170012345');
    const peticion = http.expectOne(r => r.url.endsWith(`/resultados/${INFORME}/telefono`));
    expect(peticion.request.method).toBe('PATCH');
    expect(peticion.request.body).toEqual({ telefono: '+59170012345' });
    peticion.flush({ clienteId: 'c-1', telefono: '+59170012345' });
    await expect(hecho).resolves.toEqual({ clienteId: 'c-1', telefono: '+59170012345' });
    http.verify();
  });

  /* Nombre, PAC y CI los pone el servidor desde el portal: no viajan. */
  it('crea la ficha del informe mandando solo el teléfono', async () => {
    const hecho = servicio.crearFicha(INFORME, '+59170012345');
    const peticion = http.expectOne(r => r.url.endsWith(`/resultados/${INFORME}/ficha`));
    expect(peticion.request.method).toBe('POST');
    expect(peticion.request.body).toEqual({ telefono: '+59170012345' });
    peticion.flush({ clienteId: 'c-2' });
    await expect(hecho).resolves.toEqual({ clienteId: 'c-2' });
    http.verify();
  });

  /* La ficha la busca el servidor por el teléfono: no viaja ningún id. */
  it('vincula sobre el informe mandando solo el teléfono', async () => {
    const hecho = servicio.vincularFicha(INFORME, '+59170012345');
    const peticion = http.expectOne(r => r.url.endsWith(`/resultados/${INFORME}/vincular`));
    expect(peticion.request.method).toBe('POST');
    expect(peticion.request.body).toEqual({ telefono: '+59170012345' });
    peticion.flush({ clienteId: 'c-3' });
    await expect(hecho).resolves.toEqual({ clienteId: 'c-3' });
    http.verify();
  });

  /* Filtrar y paginar lo hace el backend sobre la lista entera de la pestaña. */
  it('pide la cola con la pestaña y la búsqueda; sin búsqueda no manda el parámetro', () => {
    const conBusqueda = servicio.pendientesRequest({ pagina: 2, estado: 'ESPERANDO', busqueda: 'rocío' });
    expect(conBusqueda.url).toMatch(/\/resultados\/pendientes$/);
    expect(conBusqueda.params).toEqual({ pagina: 2, estado: 'ESPERANDO', busqueda: 'rocío' });
    expect(servicio.pendientesRequest({ pagina: 1, estado: 'POR_AVISAR' }).params).toEqual({ pagina: 1, estado: 'POR_AVISAR' });
  });
});
