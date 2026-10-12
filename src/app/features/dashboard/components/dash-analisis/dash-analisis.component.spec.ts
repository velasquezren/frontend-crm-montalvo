import '@angular/compiler';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, describe, expect, it } from 'vitest';

import { KpiDetalle, KpiResumen } from '../../kpis.model';
import { DashAnalisisComponent } from './dash-analisis.component';

const RESUMEN = {
  canales: [
    { origen: 'WHATSAPP_DIRECTO', captados: 8, respondidos: 6, convertidos: 1, medianaRespuestaMinutos: 20 },
    { origen: 'FACEBOOK_LEAD_AD', captados: 4, respondidos: 2, convertidos: 0, medianaRespuestaMinutos: 90 },
  ],
  topServicios: [{ producto: 'Ecografía', cantidad: 3, monto: 900 }],
} as unknown as KpiResumen;

const DETALLE: KpiDetalle = {
  primeraRespuesta: { menos15: 3, menosHora: 3, menos4Horas: 2, menosDia: 0, masDia: 0, sinRespuesta: 4 },
  porHora: [{ dia: 1, hora: 18, leads: 5 }, { dia: 4, hora: 9, leads: 1 }],
  chatsPorLinea: [{ lineaId: 'l1', linea: 'Ventas', chats: 10 }, { lineaId: 'l2', linea: 'Recepción', chats: 4 }],
  pacientesPorCategoria: [{ categoria: 'PROSPECTO', pacientes: 9 }, { categoria: 'GOLD', pacientes: 2 }],
  asistente: { RESPONDIO: 6, DERIVO: 2 },
};

describe('el análisis del Dashboard', () => {
  let fixture: ComponentFixture<DashAnalisisComponent>;
  let http: HttpTestingController;

  async function asentar() {
    for (let i = 0; i < 4; i++) { await Promise.resolve(); TestBed.tick(); }
    fixture.detectChanges();
  }
  async function montar(respuesta: KpiDetalle | null) {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])] });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(DashAnalisisComponent);
    fixture.componentRef.setInput('periodo', 'MES');
    fixture.componentRef.setInput('resumen', RESUMEN);
    fixture.detectChanges();
    await asentar();
    const pedido = http.expectOne(r => r.url.endsWith('/kpis/detalle') && r.params.get('periodo') === 'MES');
    if (respuesta) pedido.flush(respuesta);
    else pedido.flush({ message: 'caído' }, { status: 503, statusText: 'Unavailable' });
    await asentar();
  }
  const texto = () => (fixture.nativeElement as HTMLElement).textContent ?? '';
  afterEach(() => { http.verify(); fixture?.destroy(); });

  it('pinta las tortas, el mapa con su pico, las líneas y el asistente', async () => {
    await montar(DETALLE);
    const raiz = fixture.nativeElement as HTMLElement;
    expect(raiz.querySelectorAll('app-donut-chart')).toHaveLength(4);
    expect(texto()).toContain('50 % respondidos en la primera hora');
    expect(texto()).toContain('Más leads: Mar, de 18 a 20 h');
    expect(raiz.querySelectorAll('.ana-mapa-celda:not(.ana-mapa-muestra)')).toHaveLength(84);
    expect(texto()).toContain('Chats por línea');
    expect(texto()).toContain('75 % resuelto solo');
    /* Cada porción con su tono: la dona ya no es de un solo verde. */
    const tonos = Array.from(raiz.querySelectorAll<SVGCircleElement>('.donut-porcion')).map(c => c.style.stroke);
    expect(new Set(tonos).size).toBeGreaterThan(2);
  });

  it('una agente (sin asistente) y una sola línea: no se pintan esas tarjetas', async () => {
    await montar({ ...DETALLE, asistente: null, chatsPorLinea: [DETALLE.chatsPorLinea[0]] });
    expect(texto()).not.toContain('Asistente de IA');
    expect(texto()).not.toContain('Chats por línea');
  });

  it('si el detalle no llega, lo dice con reintento; lo que sale del resumen se sigue viendo', async () => {
    await montar(null);
    expect(texto()).toContain('Leads por canal');
    expect((fixture.nativeElement as HTMLElement).querySelectorAll('app-error-carga').length).toBeGreaterThan(0);
  });
});
