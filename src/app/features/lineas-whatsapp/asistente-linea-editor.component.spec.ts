import '@angular/compiler';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { AsistenteEditable } from './asistente-linea.model';
import { AsistenteLineaEditorComponent } from './asistente-linea-editor.component';

const PROVEEDOR_LISTO = { encendido: true, proyecto: true, credenciales: 'ARCHIVO' as const, ubicacion: 'global', modelo: 'gemini-3.5-flash', modeloClasificador: 'gemini-3.5-flash-lite', listo: true };
const APAGADO: AsistenteEditable = {
  linea: { id: 'l-ventas', nombre: 'Ventas', comercial: true },
  configuracion: { modo: 'APAGADO', conocimiento: '', criterioDerivacion: '', leerComprobantes: false, actualizadoEn: null, actualizadoPor: null },
  proveedor: { ...PROVEEDOR_LISTO, encendido: false, listo: false },
  actividad: { dias: 7, porResultado: {}, tokensEntrada: 0, tokensSalida: 0 },
};

describe('AsistenteLineaEditorComponent', () => {
  let fixture: ComponentFixture<AsistenteLineaEditorComponent>;
  let componente: AsistenteLineaEditorComponent;
  let http: HttpTestingController;
  const asentar = async () => { for (let i = 0; i < 4; i++) { await Promise.resolve(); TestBed.tick(); } };
  const texto = () => fixture.nativeElement.textContent as string;
  const boton = (t: string) => [...(fixture.nativeElement as HTMLElement).querySelectorAll('button')].find(b => (b.textContent ?? '').trim().startsWith(t));

  async function montar(respuesta: AsistenteEditable | 'error') {
    fixture = TestBed.createComponent(AsistenteLineaEditorComponent);
    componente = fixture.componentInstance;
    fixture.componentRef.setInput('lineaId', 'l-ventas');
    fixture.detectChanges();
    await asentar();
    const r = http.expectOne(x => x.url.endsWith('/asistente/lineas/l-ventas'));
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

  it('sin el servidor conectado lo dice, y deja configurar igual', async () => {
    await montar(APAGADO);
    expect(texto()).toContain('Todavía no conectado a Google');
    expect(texto()).toContain('ASISTENTE_IA');
    expect(fixture.nativeElement.querySelectorAll('input[type="radio"]')).toHaveLength(3);
  });

  it('«Responder solo» sin el criterio de la clínica no se puede guardar, y dice por qué', async () => {
    await montar({ ...APAGADO, proveedor: PROVEEDOR_LISTO });
    componente['elegirModo']('RESPONDER');
    fixture.detectChanges();
    expect(texto()).toContain('escribe primero qué temas pasan siempre a una persona');
    expect(boton('Guardar')?.disabled).toBe(true);
    componente['cambiar']({ criterioDerivacion: 'Embarazo con molestias, sangrados, dolores, medicamentos y resultados.' });
    fixture.detectChanges();
    expect(boton('Guardar')?.disabled).toBe(false);
  });

  it('guarda la configuración entera, recortada', async () => {
    await montar({ ...APAGADO, proveedor: PROVEEDOR_LISTO });
    componente['elegirModo']('SUGERIR');
    componente['cambiar']({ conocimiento: '  La consulta incluye ecografía.  ', leerComprobantes: true });
    const guardado = componente['guardar']();
    await asentar();
    const r = http.expectOne(x => x.method === 'PUT' && x.url.endsWith('/asistente/lineas/l-ventas'));
    expect(r.request.body).toEqual({ modo: 'SUGERIR', conocimiento: 'La consulta incluye ecografía.', criterioDerivacion: '', leerComprobantes: true });
    r.flush({ ...APAGADO, configuracion: { ...APAGADO.configuracion, modo: 'SUGERIR', conocimiento: 'La consulta incluye ecografía.', leerComprobantes: true } });
    await guardado;
    expect(componente.sinGuardar()).toBe(false);
  });

  it('la lectura de comprobantes solo se ofrece en una línea comercial', async () => {
    await montar({ ...APAGADO, linea: { ...APAGADO.linea, comercial: false } });
    expect(texto()).not.toContain('Leer los comprobantes de pago');
  });

  it('muestra lo que hizo en la semana', async () => {
    await montar({ ...APAGADO, actividad: { dias: 7, porResultado: { RESPONDIO: 12, DERIVO: 3 }, tokensEntrada: 1, tokensSalida: 1 } });
    expect(texto()).toContain('Respondió · 12');
    expect(texto()).toContain('Pasó a una persona · 3');
  });

  it('si el servidor falla, ofrece reintentar en vez de un formulario vacío', async () => {
    await montar('error');
    expect(texto()).toContain('Reintentar');
    expect(fixture.nativeElement.querySelector('input[type="radio"]')).toBeNull();
  });

  it('«Probar conexión» muestra cada paso con lo que falló, en palabras', async () => {
    await montar({ ...APAGADO, proveedor: PROVEEDOR_LISTO });
    const prueba = componente['probar']();
    await asentar();
    http.expectOne(x => x.method === 'POST' && x.url.endsWith('/asistente/probar')).flush({
      ok: false,
      pasos: [
        { paso: 'CONFIGURACION', ok: true, detalle: 'Proyecto configurado', ms: 0 },
        { paso: 'FILTRO', ok: false, detalle: 'Google rechazó el permiso: la cuenta de servicio necesita el rol «Vertex AI User».', ms: 812 },
      ],
    });
    await prueba;
    fixture.detectChanges();
    expect(texto()).toContain('Filtro de entrada:');
    expect(texto()).toContain('Vertex AI User');
    expect(texto()).toContain('812 ms');
  });
});
