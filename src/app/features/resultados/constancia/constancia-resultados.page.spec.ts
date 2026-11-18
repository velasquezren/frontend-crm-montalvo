import '@angular/compiler';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { routes } from '../../../app.routes';
import { authGuard } from '../../../core/auth/auth.guard';
import { AuthService } from '../../../core/auth/auth.service';
import { rolExigidoPor } from '../../../core/auth/roles';
import { ConstanciaMensual, FilaConstancia } from './constancia.model';
import { ConstanciaResultadosPage } from './constancia-resultados.page';

/**
 * La constancia se imprime para notariar: no puede salir a medias. Se piden
 * todas las páginas del backend y solo entonces se habilita «Imprimir»; con el
 * portal caído no hay documento, hay un error que lo dice.
 */
const fila = (n: number, f: Partial<FilaConstancia> = {}): FilaConstancia => ({
  avisoId: `aviso-${n}`, enviadoEn: '2026-10-03T14:05:09.000Z', enviadoPor: { nombre: 'Asistente', usuarioFilemaker: null },
  destinatario: { nombre: 'Paciente Sintética', telefono: '+59170000001', telefonoAlEnviar: true, otraFicha: false },
  informeId: `informe-${n}`, estudio: 'Ecografía obstétrica',
  informe: { tipo: 'ECOGRAFIA', fechaEstudio: '2026-10-02', estado: 'PUBLICADO', publicadoEn: '2026-10-03T13:00:00.000Z', retiradoEn: null,
    paciente: { nombre: 'Paciente Sintética', pac: 'PAC1', ci: null }, medico: 'Dra. Sintética' },
  whatsapp: { estado: 'LEIDO', enviadoEn: '2026-10-03T14:05:09.000Z', entregadoEn: '2026-10-03T14:05:20.000Z', leidoEn: '2026-10-03T15:00:00.000Z', codigoError: null },
  portal: { primera: '2026-10-03T15:01:00.000Z', pdf: { veces: 2, primera: '2026-10-03T15:01:00.000Z', ultima: '2026-10-04T09:00:00.000Z' }, original: null, adjuntos: null },
  pdfPorWhatsapp: [], ...f,
});
const pagina = (n: number, datos: FilaConstancia[], total: number, totalPaginas: number): ConstanciaMensual => ({
  datos, total, pagina: n, limite: 100, totalPaginas, mes: '2026-10',
  desde: '2026-10-01T04:00:00.000Z', hasta: '2026-11-01T04:00:00.000Z', generadoEn: '2026-11-18T14:00:00.000Z',
});

describe('constancia mensual de entregas', () => {
  let fixture: ComponentFixture<ConstanciaResultadosPage>;
  let http: HttpTestingController;
  afterEach(() => fixture?.destroy());

  async function asentar() {
    for (let i = 0; i < 4; i++) { await Promise.resolve(); TestBed.tick(); }
    fixture.detectChanges();
  }
  function montar() {
    TestBed.configureTestingModule({ providers: [
      provideHttpClient(), provideHttpClientTesting(), provideRouter([]),
      { provide: AuthService, useValue: { user: signal({ nombre: 'Admin Sintético' }) } },
    ] });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(ConstanciaResultadosPage);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }
  const botonImprimir = (raiz: HTMLElement) =>
    [...raiz.querySelectorAll('button')].find(b => b.textContent?.includes('Imprimir')) as HTMLButtonElement;

  it('trae todas las páginas antes de dejar imprimir, y cada aviso dice número, entrega y apertura', async () => {
    const raiz = montar();
    await asentar();
    const primera = http.expectOne(r => r.url.endsWith('/resultados/constancia') && r.params.get('pagina') === '1');
    expect(primera.request.params.get('limite')).toBe('100');
    primera.flush(pagina(1, [fila(1)], 2, 2));
    await asentar();
    expect(raiz.textContent).toContain('Cargando 1 de 2 avisos');
    expect(botonImprimir(raiz).disabled).toBe(true);

    http.expectOne(r => r.params.get('pagina') === '2').flush(pagina(2, [fila(2, { destinatario: { nombre: 'Madre', telefono: '+59170000002', telefonoAlEnviar: false, otraFicha: true } })], 2, 2));
    await asentar();
    const texto = raiz.textContent ?? '';
    expect(botonImprimir(raiz).disabled).toBe(false);
    expect(raiz.querySelectorAll('tbody tr')).toHaveLength(2);
    expect(texto).toContain('Octubre de 2026');
    expect(texto).toContain('por Admin Sintético');
    expect(texto).toContain('+59170000001');
    expect(texto).toContain('03/10/2026');
    /* En hora de Bolivia: 14:05 UTC son las 10:05 en La Paz. */
    expect(texto).toContain('10:05:09');
    expect(texto).toContain('Leído 03/10/2026 11:00');
    expect(texto).toContain('Abierto 03/10/2026 11:01');
    expect(texto).toContain('PDF visto 2 veces');
    /* El aviso a otra ficha dice de quién es el WhatsApp, y el número actual se marca y se explica. */
    expect(texto).toContain('WhatsApp de Madre');
    expect(texto).toContain('no guardó el número al que salió');
    http.verify();
  });

  it('imprimir llama al diálogo del navegador', async () => {
    const raiz = montar();
    await asentar();
    http.expectOne(r => r.url.endsWith('/resultados/constancia')).flush(pagina(1, [fila(1)], 1, 1));
    await asentar();
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined);
    botonImprimir(raiz).click();
    expect(print).toHaveBeenCalledOnce();
    print.mockRestore();
  });

  it('con el portal caído no hay documento: lo dice y ofrece reintentar', async () => {
    const raiz = montar();
    await asentar();
    http.expectOne(r => r.url.endsWith('/resultados/constancia')).flush({ message: 'Portal no disponible' }, { status: 503, statusText: 'Unavailable' });
    await asentar();
    expect(raiz.textContent).toContain('No se pudo armar la constancia');
    expect(raiz.querySelector('table')).toBeNull();
    expect(botonImprimir(raiz).disabled).toBe(true);
  });

  it('un mes sin avisos lo dice en vez de imprimir una tabla vacía', async () => {
    const raiz = montar();
    await asentar();
    http.expectOne(r => r.url.endsWith('/resultados/constancia')).flush(pagina(1, [], 0, 1));
    await asentar();
    expect(raiz.textContent).toContain('No se enviaron avisos de resultados en');
    expect(botonImprimir(raiz).disabled).toBe(true);
  });
});

describe('la ruta de la constancia', () => {
  /* Fuera del layout (lo que se ve es lo que se imprime), así que no hereda
     el `authGuard` del layout: lo lleva ella. Y es de administración. */
  it('pide sesión y ADMIN, sin layout', () => {
    const ruta = routes.find(r => r.path === 'imprimir/constancia-resultados');
    expect(ruta).toBeDefined();
    expect(ruta?.canActivate).toContain(authGuard);
    expect(rolExigidoPor(ruta!)).toBe('ADMIN');
  });
});

