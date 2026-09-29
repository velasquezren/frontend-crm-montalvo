import '@angular/compiler';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SwPush } from '@angular/service-worker';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { AvisosLineasComponent } from './avisos-lineas.component';
import { AvisoLinea } from './linea-whatsapp.model';

/**
 * El interruptor de «¿me suena esta línea?» de cada persona.
 *
 * Lo delicado no es encender o apagar: es qué pasa cuando el servidor dice que
 * no. Se revierte la línea que falló y SOLO esa —una foto de la lista entera
 * pisaría otro interruptor tocado mientras tanto—, y mientras una petición está
 * en vuelo su interruptor espera, para que dos toques no lleguen desordenados.
 */

const RECEPCION: AvisoLinea = { lineaId: 'l-recepcion', nombre: 'Recepción', telefono: '+59175031306', suena: true };
const VENTAS: AvisoLinea = { lineaId: 'l-ventas', nombre: 'Ventas', telefono: '+59176300126', suena: true };

describe('AvisosLineasComponent', () => {
  let fixture: ComponentFixture<AvisosLineasComponent>;
  let componente: AvisosLineasComponent;
  let http: HttpTestingController;

  async function asentar(): Promise<void> {
    for (let i = 0; i < 4; i++) {
      await Promise.resolve();
      TestBed.tick();
    }
  }

  const avisos = () => componente['avisos'].value().datos;
  const suena = (lineaId: string) => avisos().find(a => a.lineaId === lineaId)?.suena;
  const cambios = () => http.match(r => r.method === 'PUT' && r.url.includes('/avisos'));

  async function montar(datos: AvisoLinea[] = [RECEPCION, VENTAS]): Promise<void> {
    fixture = TestBed.createComponent(AvisosLineasComponent);
    componente = fixture.componentInstance;
    fixture.detectChanges();
    await asentar();
    http.expectOne(r => r.url.endsWith('/lineas-whatsapp/avisos'))
      .flush({ datos, total: datos.length, pagina: 1, limite: 100, totalPaginas: 1 });
    await asentar();
    fixture.detectChanges();
  }

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: SwPush, useValue: { isEnabled: false } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    fixture?.destroy();
    TestBed.resetTestingModule();
  });

  it('muestra cada línea que ve con su interruptor', async () => {
    await montar();
    const texto = fixture.nativeElement.textContent as string;
    expect(texto).toContain('Recepción');
    expect(texto).toContain('Ventas');
    expect(fixture.nativeElement.querySelectorAll('[role="switch"]')).toHaveLength(2);
  });

  it('apagar una línea se ve al instante y manda solo `suena` al servidor', async () => {
    await montar();
    const listo = componente['alternar'](RECEPCION.lineaId, false);
    expect(suena(RECEPCION.lineaId)).toBe(false);

    const [peticion] = cambios();
    expect(peticion.request.url).toContain(`/lineas-whatsapp/${RECEPCION.lineaId}/avisos`);
    /* Nada que identifique a la persona: el backend la saca del token. */
    expect(peticion.request.body).toEqual({ suena: false });
    peticion.flush({ lineaId: RECEPCION.lineaId, suena: false });
    await listo;
    expect(suena(RECEPCION.lineaId)).toBe(false);
  });

  it('si el servidor lo rechaza, vuelve atrás ESA línea y no pisa la otra', async () => {
    await montar();
    const fallida = componente['alternar'](RECEPCION.lineaId, false);
    const buena = componente['alternar'](VENTAS.lineaId, false);
    const [aRecepcion, aVentas] = cambios();

    aRecepcion.flush({ message: 'Línea no encontrada' }, { status: 404, statusText: 'Not Found' });
    await fallida;
    expect(suena(RECEPCION.lineaId)).toBe(true);
    /* Con una foto de la lista, este cambio se habría deshecho también. */
    expect(suena(VENTAS.lineaId)).toBe(false);

    aVentas.flush({ lineaId: VENTAS.lineaId, suena: false });
    await buena;
    expect(suena(VENTAS.lineaId)).toBe(false);
  });

  it('mientras su cambio está en vuelo, ese interruptor espera', async () => {
    await montar();
    const listo = componente['alternar'](RECEPCION.lineaId, false);
    expect(componente['enVuelo']()).toEqual([RECEPCION.lineaId]);

    cambios()[0].flush({ lineaId: RECEPCION.lineaId, suena: false });
    await listo;
    expect(componente['enVuelo']()).toEqual([]);
  });

  it('sin líneas lo dice, en vez de dejar una tarjeta vacía', async () => {
    await montar([]);
    expect(fixture.nativeElement.textContent).toContain('No atiendes ninguna línea de WhatsApp');
  });
});
