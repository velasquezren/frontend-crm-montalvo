import '@angular/compiler';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it } from 'vitest';

import { MedicoAgendaConWeb } from '../../../directorio/agenda-medicos.model';
import { CuposMedicoComponent } from './cupos-medico.component';

function medico(cambios: Partial<MedicoAgendaConWeb> = {}): MedicoAgendaConWeb {
  return {
    id: 41, codigo: 'DR41', nombre: 'Dra. Sintética', sigla: null, especialidad: 'Ginecología', telefono: null,
    estado: 'ACTIVO', precio: '250.00', bancoId: null, orden: 0, reservaEnLinea: true, casillasActivas: 12,
    fotoVersion: null, fotoUrl: null, fotoOrigen: null, web: null, ...cambios,
  };
}

const pagina = (datos: MedicoAgendaConWeb[]) => ({ datos, total: datos.length, pagina: 1, limite: 25, totalPaginas: 1 });

describe('cajón «Cupos» del compositor', () => {
  let fixture: ComponentFixture<CuposMedicoComponent>;
  let http: HttpTestingController;
  let insertado: string[];

  const raiz = () => fixture.nativeElement as HTMLElement;
  const boton = (texto: string) =>
    Array.from(raiz().querySelectorAll('button')).find(b => b.textContent?.trim().startsWith(texto)) as HTMLButtonElement | undefined;
  async function asentar() {
    for (let i = 0; i < 4; i++) { await Promise.resolve(); TestBed.tick(); }
    fixture.detectChanges();
  }
  async function buscar(texto: string) {
    const caja = raiz().querySelector('input[type="search"]') as HTMLInputElement;
    caja.value = texto;
    caja.dispatchEvent(new Event('input'));
    await asentar();
    await new Promise(r => setTimeout(r, 350));
    await asentar();
  }
  async function montar() {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(CuposMedicoComponent);
    insertado = [];
    fixture.componentInstance.insertar.subscribe(t => insertado.push(t));
    fixture.detectChanges();
    await asentar();
  }
  afterEach(() => { fixture?.destroy(); http.verify(); });

  it('busca médicos activos, ofrece el primer día libre y deja el texto elegido listo para la caja', async () => {
    await montar();
    expect(raiz().textContent).toContain('Escriba al menos dos letras');
    await buscar('gine');

    const lista = http.expectOne(r => r.url.endsWith('/agenda/medicos'));
    expect(lista.request.params.get('buscar')).toBe('gine');
    expect(lista.request.params.get('estado')).toBe('ACTIVO');
    lista.flush(pagina([medico()]));
    await asentar();

    boton('Dra. Sintética')!.click();
    await asentar();
    const dias = http.expectOne(r => r.url.endsWith('/publico/agenda/dias'));
    expect(dias.request.params.get('medicoId')).toBe('41');
    dias.flush({ medicoId: '41', zonaHoraria: 'America/La_Paz', fechas: ['2026-10-23', '2026-10-26'] });
    await asentar();

    /* Sin un toque más: el primer día libre ya está elegido y pide sus horas. */
    const horas = http.expectOne(r => r.url.endsWith('/publico/agenda/disponibilidad'));
    expect(horas.request.params.get('fecha')).toBe('2026-10-23');
    horas.flush({
      medicoId: '41', fecha: '2026-10-23', zonaHoraria: 'America/La_Paz', consultadoEn: '2026-10-18T14:05:00.000Z',
      estado: 'DISPONIBLE', horarios: [{ id: 'a', hora: '10:30' }, { id: 'b', hora: '11:00' }],
    });
    await asentar();
    expect(raiz().textContent).toContain('Consulta');
    expect(raiz().textContent).toContain('Agenda leída a las 10:05');

    const poner = boton('Poner en el mensaje')!;
    expect(poner.disabled).toBe(true);
    boton('10:30')!.click();
    boton('11:00')!.click();
    await asentar();
    expect(boton('10:30')!.getAttribute('aria-pressed')).toBe('true');
    expect(raiz().querySelector('.cupos-vista-previa')?.textContent).toContain('Viernes 23 de octubre: 10:30 y 11:00');

    boton('Poner en el mensaje')!.click();
    expect(insertado).toEqual([[
      'Tenemos estos horarios disponibles con Dra. Sintética (Ginecología):',
      '• Viernes 23 de octubre: 10:30 y 11:00',
      '¿Cuál le queda mejor?',
    ].join('\n')]);
  });

  it('un médico sin horario es «a solicitud» y no se le piden días a la agenda', async () => {
    await montar();
    await buscar('pru');
    http.expectOne(r => r.url.endsWith('/agenda/medicos')).flush(pagina([medico({ id: 7, nombre: 'Dr. Prueba', reservaEnLinea: false })]));
    await asentar();
    expect(raiz().textContent).toContain('A solicitud');

    boton('Dr. Prueba')!.click();
    await asentar();
    http.expectNone(r => r.url.includes('/publico/agenda/'));
    expect(raiz().textContent).toContain('Atiende a solicitud');
    expect(boton('Poner en el mensaje')!.disabled).toBe(true);
  });

  it('si la agenda no responde lo dice con «Reintentar», nunca como «sin cupos»', async () => {
    await montar();
    await buscar('gine');
    http.expectOne(r => r.url.endsWith('/agenda/medicos')).flush(pagina([medico()]));
    await asentar();
    boton('Dra. Sintética')!.click();
    await asentar();
    http.expectOne(r => r.url.endsWith('/publico/agenda/dias')).flush({}, { status: 503, statusText: 'Unavailable' });
    await asentar();
    expect(raiz().textContent).not.toContain('Sin cupos en los próximos 30 días');
    boton('Reintentar')!.click();
    await asentar();
    http.expectOne(r => r.url.endsWith('/publico/agenda/dias')).flush({ medicoId: '41', zonaHoraria: 'America/La_Paz', fechas: [] });
    await asentar();
    expect(raiz().textContent).toContain('Sin cupos en los próximos 30 días');
  });

  it('cambiar de médico vuelve a la búsqueda con lo escrito y descarta lo elegido', async () => {
    await montar();
    await buscar('gine');
    http.expectOne(r => r.url.endsWith('/agenda/medicos')).flush(pagina([medico()]));
    await asentar();
    boton('Dra. Sintética')!.click();
    await asentar();
    http.expectOne(r => r.url.endsWith('/publico/agenda/dias')).flush({ medicoId: '41', zonaHoraria: 'America/La_Paz', fechas: ['2026-10-23'] });
    await asentar();
    http.expectOne(r => r.url.endsWith('/publico/agenda/disponibilidad')).flush({
      medicoId: '41', fecha: '2026-10-23', zonaHoraria: 'America/La_Paz', consultadoEn: '2026-10-18T14:05:00.000Z',
      estado: 'DISPONIBLE', horarios: [{ id: 'a', hora: '10:30' }],
    });
    await asentar();
    boton('10:30')!.click();
    await asentar();

    boton('Cambiar')!.click();
    await asentar();
    http.match(r => r.url.endsWith('/agenda/medicos')).forEach(r => r.flush(pagina([medico()])));
    await asentar();
    expect((raiz().querySelector('input[type="search"]') as HTMLInputElement).value).toBe('gine');
    expect(raiz().querySelector('.cupos-vista-previa')).toBeNull();
    expect(boton('Poner en el mensaje')!.disabled).toBe(true);
  });
});
