import '@angular/compiler';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { CobroEditable } from './cobro-linea.model';
import { CobroLineaEditorComponent } from './cobro-linea-editor.component';

const SIN_CONFIGURAR: CobroEditable = {
  lineaId: 'l-ventas', linea: { nombre: 'Ventas', comercial: true }, cobro: null,
  estado: 'SIN_CONFIGURAR', actualizadoEn: null, actualizadoPor: null,
};
const LISTO: CobroEditable = {
  ...SIN_CONFIGURAR,
  cobro: { activo: true, banco: 'BCP', titular: 'Clínica SRL', instrucciones: null, venceEl: null, imagenUrl: 'https://r2.invalid/qr.png' },
  estado: 'LISTO',
};

describe('CobroLineaEditorComponent', () => {
  let fixture: ComponentFixture<CobroLineaEditorComponent>;
  let componente: CobroLineaEditorComponent;
  let http: HttpTestingController;
  const asentar = async () => { for (let i = 0; i < 4; i++) { await Promise.resolve(); TestBed.tick(); } };
  const texto = () => fixture.nativeElement.textContent as string;

  async function montar(respuesta: CobroEditable | 'error') {
    fixture = TestBed.createComponent(CobroLineaEditorComponent);
    componente = fixture.componentInstance;
    fixture.componentRef.setInput('lineaId', 'l-ventas');
    fixture.detectChanges();
    await asentar();
    const r = http.expectOne(x => x.url.endsWith('/cobros/l-ventas'));
    if (respuesta === 'error') r.flush({ message: 'Caído' }, { status: 503, statusText: 'Service Unavailable' });
    else r.flush(respuesta);
    await asentar();
    fixture.detectChanges();
  }

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => { fixture?.destroy(); TestBed.resetTestingModule(); });

  it('sin configurar: pide subir el QR y no inventa banco ni titular', async () => {
    await montar(SIN_CONFIGURAR);
    expect(texto()).toContain('Todavía no hay QR');
    expect(componente['borrador']()).toEqual({ activo: false, banco: '', titular: '', instrucciones: '', venceEl: '' });
  });

  it('activo: lo dice y muestra el QR', async () => {
    await montar(LISTO);
    expect(texto()).toContain('las promociones ofrecen «Pagar ahora»');
    expect(fixture.nativeElement.querySelector('img[alt="QR de pago de esta línea"]')).not.toBeNull();
  });

  it('si el servidor no responde lo dice, en vez de un formulario en blanco', async () => {
    await montar('error');
    expect(texto()).toContain('el cobro de esta línea');
  });

  it('guardar manda los datos limpios y usa la respuesta (sin otro GET)', async () => {
    await montar(LISTO);
    componente['cambiar']({ instrucciones: '  Pon tu nombre en la glosa  ' });
    expect(componente.sinGuardar()).toBe(true);
    const listo = componente['guardar']();
    await asentar();
    const r = http.expectOne(x => x.method === 'PUT' && x.url.endsWith('/cobros/l-ventas'));
    expect(r.request.body).toEqual({ activo: true, banco: 'BCP', titular: 'Clínica SRL', instrucciones: 'Pon tu nombre en la glosa', venceEl: null });
    r.flush({ ...LISTO, cobro: { ...LISTO.cobro!, instrucciones: 'Pon tu nombre en la glosa' } });
    await listo;
    http.expectNone(x => x.method === 'GET');
    expect(componente.sinGuardar()).toBe(false);
  });

  it('si el servidor rechaza (p. ej. activar sin QR), muestra su motivo', async () => {
    await montar(SIN_CONFIGURAR);
    componente['cambiar']({ activo: true, banco: 'BCP', titular: 'Clínica' });
    const listo = componente['guardar']();
    await asentar();
    http.expectOne(x => x.method === 'PUT').flush({ message: 'Sube la imagen del QR antes de activar el cobro.' }, { status: 400, statusText: 'Bad Request' });
    await listo;
    fixture.detectChanges();
    expect(texto()).toContain('Sube la imagen del QR antes de activar el cobro.');
  });

  it('subir el QR no pierde lo que se estaba escribiendo', async () => {
    await montar(SIN_CONFIGURAR);
    componente['cambiar']({ banco: 'BNB' });
    const archivo = new File([new Uint8Array(10)], 'qr.png', { type: 'image/png' });
    const evento = { target: { files: [archivo], value: 'x' } } as unknown as Event;
    const listo = componente['elegirQr'](evento);
    await asentar();
    http.expectOne(x => x.method === 'PUT' && x.url.endsWith('/cobros/l-ventas/qr')).flush({ ...SIN_CONFIGURAR, estado: 'APAGADO', cobro: { activo: false, banco: '', titular: '', instrucciones: null, venceEl: null, imagenUrl: 'https://r2.invalid/qr.png' } });
    await listo;
    expect(componente['borrador']().banco).toBe('BNB');
  });
});
