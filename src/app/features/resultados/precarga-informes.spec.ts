import { TestBed } from '@angular/core/testing';
import { Observable, Subject } from 'rxjs';

import { EstadoDescarga } from '../../core/api/api.service';
import { PrecargaInformes } from './precarga-informes';
import { textoAvance } from './resultados.page';
import { ResultadosService } from './resultados.service';

/*
 * El servidor entrega el PDF en ~0,1 s; lo que tarda es bajar 3-5 MB hasta la
 * clínica. Estas pruebas fijan que la precarga ayuda sin estorbar: de a uno,
 * sin repetir, sin quedarse con un fallo y soltando todo al salir.
 */
describe('PrecargaInformes', () => {
  let pedidas: Map<string, Subject<EstadoDescarga>>;
  let abortadas: string[];
  let precarga: PrecargaInformes;

  beforeEach(() => {
    pedidas = new Map();
    abortadas = [];
    /* Como `HttpClient`: desuscribirse antes de terminar es abortar. */
    const resultados = {
      pdf: (id: string) =>
        new Observable<EstadoDescarga>(suscriptor => {
          const flujo = new Subject<EstadoDescarga>();
          pedidas.set(id, flujo);
          let terminada = false;
          flujo.subscribe({
            next: e => suscriptor.next(e),
            error: e => { terminada = true; suscriptor.error(e); },
            complete: () => { terminada = true; suscriptor.complete(); },
          });
          return () => { if (!terminada) abortadas.push(id); };
        }),
    };
    TestBed.configureTestingModule({
      providers: [PrecargaInformes, { provide: ResultadosService, useValue: resultados }],
    });
    precarga = TestBed.inject(PrecargaInformes);
  });

  const terminar = (id: string) => {
    pedidas.get(id)!.next({ listo: true, blob: new Blob([id]) });
    pedidas.get(id)!.complete();
  };

  it('baja de a uno: dos en paralelo se reparten la conexión y ninguno llega antes', async () => {
    precarga.precargar(['a', 'b', 'c']);
    expect([...pedidas.keys()]).toEqual(['a']);
    terminar('a');
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    expect([...pedidas.keys()]).toEqual(['a', 'b']);
  });

  it('abrir un informe ya precargado no lo vuelve a pedir', async () => {
    precarga.precargar(['a']);
    terminar('a');
    const pdf = await precarga.obtener('a').pdf;
    expect(await pdf.text()).toBe('a');
    expect(pedidas.size).toBe(1);
  });

  it('el progreso se lee mientras baja', () => {
    const descarga = precarga.obtener('a');
    pedidas.get('a')!.next({ listo: false, cargados: 1_000, total: 4_000 });
    expect(descarga.progreso()).toBe(0.25);
  });

  it('una descarga fallida no se queda: el siguiente clic la vuelve a pedir', async () => {
    const primera = precarga.obtener('a');
    pedidas.get('a')!.error(new Error('red'));
    await expect(primera.pdf).rejects.toThrow('red');
    precarga.obtener('a');
    pedidas.get('a')!.next({ listo: false, cargados: 1, total: 2 });
    expect(precarga.obtener('a')).not.toBe(primera);
  });

  it('al salir de la página se aborta lo que sigue bajando', () => {
    precarga.obtener('a');
    TestBed.resetTestingModule();
    expect(abortadas).toEqual(['a']);
  });
});

describe('textoAvance', () => {
  it('porcentaje si se sabe el total; si no, los MB que llevan', () => {
    expect(textoAvance(0.456, 0)).toBe('46%');
    expect(textoAvance(null, 1_572_864)).toBe('1,5 MB');
    expect(textoAvance(null, 0)).toBe('');
  });
});
