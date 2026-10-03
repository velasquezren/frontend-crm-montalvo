import '@angular/compiler';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { paginaVacia } from '../../../../core/api/pagination.model';
import { PlantillaResumen } from '../../../conversaciones/conversacion.model';
import { NuevaCampanaComponent } from './nueva-campana.component';

const plantilla: PlantillaResumen = {
  nombre: 'promo', idioma: 'es', categoria: 'MARKETING', cuerpo: 'Hola {{1}}',
  variables: 1, nombresVariables: ['1'], formato: 'POSITIONAL', pie: null,
  botones: [], imagenCabecera: null, enviable: true, motivoNoEnviable: null,
};

describe('creación de campañas por HTTP', () => {
  let fixture: ComponentFixture<NuevaCampanaComponent>;
  let http: HttpTestingController;
  async function asentar() {
    for (let i = 0; i < 4; i++) { await Promise.resolve(); TestBed.tick(); }
  }
  beforeEach(async () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(NuevaCampanaComponent);
    fixture.componentRef.setInput('filtro', { categorias: ['GOLD'], diasSinCampana: 30, soloConversaron: false });
    fixture.componentRef.setInput('elegibles', 1);
    fixture.componentRef.setInput('tarifaUsd', 0.055);
    fixture.detectChanges();
    await asentar();
  });
  afterEach(() => { fixture.destroy(); http.verify(); });

  async function listaParaEnviar() {
    http.expectOne(r => r.url.endsWith('/lineas-whatsapp')).flush({
      ...paginaVacia(), datos: [{ id: 'linea', nombre: 'Ventas', activa: true, conectada: true, comercial: true }],
    });
    const c = fixture.componentInstance;
    c['nombre'].set('Gold octubre'); c['lineaId'].set('linea');
    await asentar();
    http.expectOne(r => r.url.endsWith('/meta/plantillas')).flush([plantilla]);
    await asentar();
    c['plantillaClave'].set('promo|es');
    await asentar();
    return c;
  }

  it('un error de líneas se muestra y permite reintentar sin romper el render', async () => {
    http.expectOne(r => r.url.endsWith('/lineas-whatsapp')).flush({}, { status: 503, statusText: 'Unavailable' });
    await asentar();
    expect(fixture.nativeElement.textContent).toContain('No se pudieron cargar las líneas.');
    const boton = [...fixture.nativeElement.querySelectorAll('button')].find(b => b.textContent?.includes('Reintentar'));
    boton?.click();
    await asentar();
    http.expectOne(r => r.url.endsWith('/lineas-whatsapp')).flush(paginaVacia());
    await asentar();
    expect(fixture.nativeElement.textContent).toContain('No hay ninguna línea conectada');
  });

  it('un error de plantillas deja el formulario visible y bloquea el envío', async () => {
    http.expectOne(r => r.url.endsWith('/lineas-whatsapp')).flush(paginaVacia());
    fixture.componentInstance['lineaId'].set('linea');
    await asentar();
    http.expectOne(r => r.url.endsWith('/meta/plantillas')).flush({}, { status: 502, statusText: 'Bad Gateway' });
    await asentar();
    expect(fixture.nativeElement.textContent).toContain('No se pudieron consultar las plantillas');
    await fixture.componentInstance['lanzar']();
    http.expectNone(r => r.method === 'POST');
  });

  it('la hora elegida se manda en La Paz y los clics repetidos no crean dos campañas', async () => {
    const c = await listaParaEnviar();
    // El reloj del formulario tiene zona propia: no depende de TZ del runner.
    const manana = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    c['programar'].set(true); c['programadaPara'].set(`${manana}T10:30`);
    expect(c['falta']()).toBeNull();
    const pedido = c['lanzar']();
    await c['lanzar']();
    const post = http.expectOne(r => r.method === 'POST' && r.url.endsWith('/campanas'));
    expect(post.request.body.programadaPara).toBe(`${manana}T14:30:00Z`);
    post.flush({ id: 'c1', nombre: 'Gold octubre', estado: 'PROGRAMADA' });
    await pedido;
  });

  it('rechaza fechas inexistentes y textos que el backend no acepta', async () => {
    const c = await listaParaEnviar();
    c['programar'].set(true); c['programadaPara'].set('2026-02-30T10:00');
    expect(c['falta']()).toContain('válidos');
    c['programar'].set(false); c['cambiarValor'](0, 'x'.repeat(61));
    expect(c['falta']()).toContain('60 caracteres');
    await c['lanzar']();
    http.expectNone(r => r.method === 'POST');
  });
});
