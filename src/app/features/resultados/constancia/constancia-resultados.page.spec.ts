import '@angular/compiler';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { routes } from '../../../app.routes';
import { authGuard } from '../../../core/auth/auth.guard';
import { AuthService } from '../../../core/auth/auth.service';
import { rolExigidoPor } from '../../../core/auth/roles';
import { ConstanciaMensual, FilaConstancia, MesConstancia } from './constancia.model';
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
  linea: { nombre: 'Recepción', telefono: '+59170000100' },
  portal: { primera: '2026-10-03T15:01:00.000Z', pdf: { veces: 2, primera: '2026-10-03T15:01:00.000Z', ultima: '2026-10-04T09:00:00.000Z' }, original: null, adjuntos: null },
  pdfPorWhatsapp: [], ...f,
});
const pagina = (n: number, datos: FilaConstancia[], total: number, totalPaginas: number): ConstanciaMensual => ({
  datos, total, pagina: n, limite: 100, totalPaginas, mes: '2026-10',
  desde: '2026-10-01T04:00:00.000Z', hasta: '2026-11-01T04:00:00.000Z', generadoEn: '2026-11-18T14:00:00.000Z',
  version: 'EN_VIVO', validacion: null,
});
const validacion = { en: '2026-11-05T15:30:00.000Z', porNombre: 'Super Sintética', totalAvisos: 1 };
const mesHistorial = (mes: string, m: Partial<MesConstancia> = {}): MesConstancia => ({
  mes, avisos: 3, enCurso: false, validacion: null, impresiones: { total: 0, ultima: null }, ...m,
});

describe('constancia mensual de entregas', () => {
  let fixture: ComponentFixture<ConstanciaResultadosPage>;
  let http: HttpTestingController;
  afterEach(() => { fixture?.destroy(); historial = []; });

  /** El historial de meses se pide aparte; los tests que no lo miran lo reciben vacío. */
  let historial: MesConstancia[] = [];
  async function asentar() {
    for (const r of http?.match(req => req.url.endsWith('/resultados/constancia/meses')) ?? []) r.flush(historial);
    for (let i = 0; i < 4; i++) { await Promise.resolve(); TestBed.tick(); }
    fixture.detectChanges();
  }
  function montar(url = '/imprimir/constancia-resultados', rol: 'ADMIN' | 'SUPER_ADMIN' = 'ADMIN') {
    TestBed.configureTestingModule({ providers: [
      provideHttpClient(), provideHttpClientTesting(), provideRouter([]),
      { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap(Object.fromEntries(new URL(url, 'http://x').searchParams)) } } },
      { provide: AuthService, useValue: { user: signal({ nombre: 'Admin Sintético', rol }) } },
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
    expect(raiz.querySelectorAll('.tabla-detalle tbody tr')).toHaveLength(2);
    expect(texto).toContain('Octubre de 2026');
    /* Quien MIRA la pantalla no es el autor: antes la cabecera decía «Generada por <quien mira>». */
    expect(texto).not.toContain('por Admin Sintético');
    expect(texto).toContain('sin validar');
    expect(texto).toContain('+59170000001');
    expect(texto).toContain('03/10/2026');
    /* En hora de Bolivia: 14:05 UTC son las 10:05 en La Paz. */
    expect(texto).toContain('10:05:09');
    expect(texto).toContain('Leído 03/10/2026 11:00');
    /* La insignia dice el estado y debajo, la hora de la primera apertura. */
    const portal = raiz.querySelector('tbody tr td:nth-child(7)')?.textContent?.replace(/\s+/g, ' ');
    expect(portal).toContain('Abierto');
    expect(portal).toContain('Primera vez 03/10/2026 11:01');
    /* El PAC ya trae su prefijo: «PAC1», no «PAC PAC1». */
    expect(texto).not.toContain('PAC PAC1');
    expect(texto).toContain('PDF visto 2 veces');
    /* El aviso a otra ficha dice de quién es el WhatsApp, y el número actual se marca y se explica. */
    expect(texto).toContain('WhatsApp de Madre');
    expect(texto).toContain('no guardó el número al que salió');
    http.verify();
  });

  it('separa los avisos por tipo de informe, con el reparto arriba y la línea de cada tipo', async () => {
    const raiz = montar();
    await asentar();
    const lab = (n: number) => fila(n, {
      estudio: 'Hemograma', linea: { nombre: 'Laboratorio CLIMON', telefono: '+59177385889' },
      informe: { ...fila(n).informe!, tipo: 'LABORATORIO' },
    });
    http.expectOne(r => r.url.endsWith('/resultados/constancia')).flush(pagina(1, [fila(1), lab(2), lab(3)], 3, 1));
    await asentar();

    const titulos = [...raiz.querySelectorAll('.seccion .titulo-bloque')].map(h => h.textContent?.replace(/\s+/g, ' ').trim());
    expect(titulos).toEqual(['Ecografías 1 aviso', 'Laboratorio 2 avisos']);
    /* El reparto por tipo, con su fila de total. */
    expect(raiz.textContent).toContain('Resumen por tipo de informe');
    /* Un documento, no un panel: ninguna tabla enmarcada dentro de la hoja. */
    expect(raiz.querySelectorAll('.crm-table-marco:not(.crm-table-plana)')).toHaveLength(0);
    expect(raiz.querySelector('.tabla-resumen tfoot')?.textContent).toContain('3');
    /* Cada sección dice por qué línea salió: el laboratorio no sale por la de la clínica. */
    const [eco, laboratorio] = [...raiz.querySelectorAll('.seccion')];
    expect(eco.textContent).toContain('línea Recepción');
    expect(laboratorio.textContent).toContain('línea Laboratorio CLIMON');
    expect(laboratorio.querySelectorAll('tbody tr')).toHaveLength(2);
    http.verify();
  });

  it('con un tipo en la URL muestra e imprime solo ese tipo, sin el reparto', async () => {
    const raiz = montar('/imprimir/constancia-resultados?tipo=LABORATORIO');
    await asentar();
    const lab = fila(2, { informe: { ...fila(2).informe!, tipo: 'LABORATORIO' } });
    http.expectOne(r => r.url.endsWith('/resultados/constancia')).flush(pagina(1, [fila(1), lab], 2, 1));
    await asentar();
    expect(raiz.querySelectorAll('.seccion')).toHaveLength(1);
    expect(raiz.querySelector('.tabla-resumen')).toBeNull();
    expect(raiz.querySelector('.ficha')?.textContent).toContain('Laboratorio');
    expect(raiz.querySelector('.cifras')?.textContent).toContain('Avisos enviados1');
    expect(botonImprimir(raiz).disabled).toBe(false);
  });

  it('busca por número aunque se escriba con espacios, y la hoja dice que está filtrada', async () => {
    const raiz = montar('/imprimir/constancia-resultados?q=7000%200002');
    await asentar();
    const otra = fila(2, { destinatario: { nombre: 'Otra', telefono: '+59170000002', telefonoAlEnviar: true, otraFicha: false } });
    http.expectOne(r => r.url.endsWith('/resultados/constancia')).flush(pagina(1, [fila(1), otra], 2, 1));
    await asentar();
    expect(raiz.querySelectorAll('.tabla-detalle tbody tr')).toHaveLength(1);
    expect(raiz.querySelector('.tabla-detalle tbody')?.textContent).toContain('+59170000002');
    /* Impresa, una constancia filtrada no puede pasar por la del mes entero. */
    expect(raiz.querySelector('.documento')?.textContent).toContain('Constancia filtrada');
    expect(raiz.querySelector('.documento')?.textContent).toContain('incluye 1 de los 2 avisos');
    expect(botonImprimir(raiz).disabled).toBe(false);
  });

  it('el filtro de estado deja solo los no entregados; sin coincidencias ofrece quitar los filtros', async () => {
    const raiz = montar('/imprimir/constancia-resultados?estado=NO_ENTREGADOS');
    await asentar();
    const fallido = fila(2, { whatsapp: { estado: 'FALLIDO', enviadoEn: '2026-10-03T14:05:09.000Z', entregadoEn: null, leidoEn: null, codigoError: 131026 } });
    http.expectOne(r => r.url.endsWith('/resultados/constancia')).flush(pagina(1, [fila(1), fallido], 2, 1));
    await asentar();
    const filas = raiz.querySelectorAll('.tabla-detalle tbody tr');
    expect(filas).toHaveLength(1);
    expect(filas[0].textContent).toContain('No entregado');
    expect(filas[0].textContent).toContain('Código 131026');

    const quitar = [...raiz.querySelectorAll('button')].find(b => b.textContent?.includes('Quitar filtros')) as HTMLButtonElement;
    quitar.click();
    await asentar();
    expect(raiz.querySelectorAll('.tabla-detalle tbody tr')).toHaveLength(2);
    expect(raiz.textContent).not.toContain('Constancia filtrada');
  });

  it('imprimir primero registra quién imprime, lo pone en la cabecera y después abre el diálogo', async () => {
    const raiz = montar('/imprimir/constancia-resultados?tipo=ECOGRAFIA');
    await asentar();
    http.expectOne(r => r.url.endsWith('/resultados/constancia')).flush(pagina(1, [fila(1)], 1, 1));
    await asentar();
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined);
    botonImprimir(raiz).click();
    await asentar();
    expect(print).not.toHaveBeenCalled();
    const registro = http.expectOne(r => r.url.endsWith('/resultados/constancia/2026-10/impresion'));
    expect(registro.request.method).toBe('POST');
    expect(registro.request.body).toEqual({ tipo: 'ECOGRAFIA', filas: 1, version: 'EN_VIVO' });
    registro.flush({ impresaEn: '2026-11-27T13:00:00.000Z', porNombre: 'Admin Sintético' });
    await asentar();
    await asentar();
    expect(print).toHaveBeenCalledOnce();
    expect(raiz.querySelector('.ficha')?.textContent).toContain('Impresa');
    expect(raiz.querySelector('.ficha')?.textContent).toContain('por Admin Sintético');
    print.mockRestore();
  });

  it('si no se puede registrar la impresión, no imprime', async () => {
    const raiz = montar();
    await asentar();
    http.expectOne(r => r.url.endsWith('/resultados/constancia')).flush(pagina(1, [fila(1)], 1, 1));
    await asentar();
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined);
    botonImprimir(raiz).click();
    await asentar();
    http.expectOne(r => r.url.endsWith('/impresion')).flush({ message: 'caído' }, { status: 503, statusText: 'Unavailable' });
    await asentar();
    expect(print).not.toHaveBeenCalled();
    print.mockRestore();
  });

  it('un mes validado muestra la copia fija con quién la validó, y se puede ver en vivo', async () => {
    const raiz = montar();
    await asentar();
    http.expectOne(r => r.url.endsWith('/resultados/constancia')).flush({ ...pagina(1, [fila(1)], 1, 1), version: 'VALIDADA', validacion });
    await asentar();
    expect(raiz.querySelector('.ficha')?.textContent).toContain('por Super Sintética (copia fija)');
    expect(raiz.querySelector('.estado-mes')?.textContent).toContain('Validado el');

    const enVivo = [...raiz.querySelectorAll('.estado-mes button')].find(b => b.textContent?.includes('En vivo')) as HTMLButtonElement;
    enVivo.click();
    await asentar();
    const pedida = http.expectOne(r => r.url.endsWith('/resultados/constancia'));
    expect(pedida.request.params.get('version')).toBe('EN_VIVO');
    pedida.flush({ ...pagina(1, [fila(1)], 1, 1), version: 'EN_VIVO', validacion });
    await asentar();
    expect(raiz.textContent).toContain('Versión en vivo');
  });

  it('solo SUPER_ADMIN ve «Validar mes», y en un mes ya cerrado', async () => {
    const admin = montar();
    await asentar();
    http.expectOne(r => r.url.endsWith('/resultados/constancia')).flush(pagina(1, [fila(1)], 1, 1));
    await asentar();
    expect(admin.textContent).not.toContain('Validar mes');
    fixture.destroy();
    TestBed.resetTestingModule();

    const superAdmin = montar('/imprimir/constancia-resultados?mes=2026-10', 'SUPER_ADMIN');
    await asentar();
    http.expectOne(r => r.url.endsWith('/resultados/constancia')).flush(pagina(1, [fila(1)], 1, 1));
    await asentar();
    const validar = [...superAdmin.querySelectorAll('app-button')].find(b => b.textContent?.includes('Validar mes'));
    expect(validar).toBeDefined();
  });

  it('el historial lista los meses con su validación e impresiones', async () => {
    historial = [
      mesHistorial('2026-11', { enCurso: true }),
      mesHistorial('2026-10', { validacion, impresiones: { total: 2, ultima: { en: '2026-11-06T13:00:00.000Z', porNombre: 'Admin Sintético' } } }),
    ];
    const raiz = montar();
    await asentar();
    http.expectOne(r => r.url.endsWith('/resultados/constancia')).flush(pagina(1, [fila(1)], 1, 1));
    await asentar();
    const tabla = raiz.querySelector('.historial')?.textContent ?? '';
    expect(tabla).toContain('Noviembre de 2026');
    expect(tabla).toContain('En curso');
    expect(tabla).toContain('Super Sintética');
    expect(tabla).toContain('2 · última');
  });

  it('con el portal caído no hay documento: lo dice y ofrece reintentar', async () => {
    const raiz = montar();
    await asentar();
    http.expectOne(r => r.url.endsWith('/resultados/constancia')).flush({ message: 'Portal no disponible' }, { status: 503, statusText: 'Unavailable' });
    await asentar();
    expect(raiz.textContent).toContain('No se pudo armar la constancia');
    expect(raiz.querySelector('.documento')).toBeNull();
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

