import '@angular/compiler';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { MenuAtencionEditorComponent } from './menu-atencion-editor.component';
import { MenuEditable } from './menu-atencion.model';

/**
 * El editor del menú de atención. Lo que importa: carga lo guardado, no deja
 * quitar la salida a una persona, manda el menú entero y limpio, y si el
 * servidor lo rechaza muestra SUS motivos, uno por línea, sin perder lo escrito.
 */

const GUARDADO: MenuEditable = {
  lineaId: 'l-recepcion',
  linea: { nombre: 'Recepción', comercial: false },
  menu: {
    activo: true,
    saludo: 'Hola, ¿en qué te ayudamos?',
    opciones: [
      { tipo: 'PERSONA', titulo: 'Hablar con una persona' },
      { tipo: 'EMERGENCIA', titulo: 'Es una emergencia', respuesta: 'Orientación aprobada.' },
    ],
  },
  errores: [],
  actualizadoEn: '2026-10-05T12:00:00.000Z',
  actualizadoPor: { id: 'u1', nombre: 'René' },
  enviosHabilitados: true,
};

describe('MenuAtencionEditorComponent', () => {
  let fixture: ComponentFixture<MenuAtencionEditorComponent>;
  let componente: MenuAtencionEditorComponent;
  let http: HttpTestingController;

  async function asentar(): Promise<void> {
    for (let i = 0; i < 4; i++) {
      await Promise.resolve();
      TestBed.tick();
    }
  }
  const texto = () => fixture.nativeElement.textContent as string;
  const borrador = () => componente['borrador']();

  async function montar(respuesta: MenuEditable | 'error' = GUARDADO): Promise<void> {
    fixture = TestBed.createComponent(MenuAtencionEditorComponent);
    componente = fixture.componentInstance;
    fixture.componentRef.setInput('lineaId', 'l-recepcion');
    fixture.componentRef.setInput('nombre', 'Recepción');
    fixture.detectChanges();
    await asentar();
    const peticion = http.expectOne(r => r.url.endsWith('/menu-atencion/l-recepcion'));
    if (respuesta === 'error') peticion.flush({ message: 'Caído' }, { status: 503, statusText: 'Service Unavailable' });
    else peticion.flush(respuesta);
    await asentar();
    fixture.detectChanges();
  }

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    fixture?.destroy();
    TestBed.resetTestingModule();
  });

  it('muestra lo guardado y cómo lo verá la paciente', async () => {
    await montar();
    expect(texto()).toContain('Es una emergencia');
    expect(texto()).toContain('Así lo verá la paciente');
    expect(texto()).toContain('Última edición: René');
  });

  it('Recepción no permite agregar promociones, ni restaurarlas mediante deshacer', async () => {
    await montar();
    componente['tipoNuevo'].set('PROMOCIONES');
    componente['agregar']();
    expect(borrador().opciones.some(o => o.tipo === 'PROMOCIONES')).toBe(false);
    componente['quitada'].set({ opcion: { tipo: 'PROMOCIONES', titulo: 'Promos' }, indice: 0 });
    componente['deshacerQuitar']();
    expect(borrador().opciones.some(o => o.tipo === 'PROMOCIONES')).toBe(false);
    expect(texto()).toContain('Las promociones y sus cobros se gestionan desde Ventas');
  });

  it('Ventas permite preparar promociones sin activar automáticamente el menú', async () => {
    await montar({ ...GUARDADO, linea: { nombre: 'Ventas', comercial: true }, menu: null });
    componente['tipoNuevo'].set('PROMOCIONES');
    componente['agregar']();
    expect(borrador().opciones.some(o => o.tipo === 'PROMOCIONES')).toBe(true);
    expect(borrador().activo).toBe(false);
  });

  it('sin menú todavía, empieza con la salida a una persona y sin textos inventados', async () => {
    await montar({ ...GUARDADO, menu: null, actualizadoPor: null });
    expect(texto()).toContain('Esta línea todavía no tiene menú');
    expect(borrador().opciones.map(o => o.tipo)).toEqual(['PERSONA']);
    expect(borrador().saludo).toBe('');
  });

  it('si el servidor no responde lo dice, en vez de un menú en blanco', async () => {
    await montar('error');
    expect(texto()).toContain('el menú de esta línea');
    expect(texto()).not.toContain('Así lo verá la paciente');
  });

  it('avisa si los envíos interactivos están apagados en el servidor', async () => {
    await montar({ ...GUARDADO, enviosHabilitados: false });
    expect(texto()).toContain('Los envíos interactivos están apagados en el servidor');
  });

  it('la salida a una persona no se puede quitar; las demás sí, y se reordenan', async () => {
    await montar();
    componente['quitar'](0);
    expect(borrador().opciones.map(o => o.tipo)).toEqual(['PERSONA', 'EMERGENCIA']);
    componente['mover'](1, -1);
    expect(borrador().opciones.map(o => o.tipo)).toEqual(['EMERGENCIA', 'PERSONA']);
    componente['quitar'](0);
    expect(borrador().opciones.map(o => o.tipo)).toEqual(['PERSONA']);
  });

  it('agregar ofrece solo lo que falta y propone un título editable', async () => {
    await montar();
    componente['tipoNuevo'].set('EMERGENCIA');
    componente['agregar']();
    expect(borrador().opciones).toHaveLength(2);
    componente['tipoNuevo'].set('RESPUESTA');
    componente['agregar']();
    expect(borrador().opciones.at(-1)).toMatchObject({ tipo: 'RESPUESTA', titulo: 'Horarios' });
  });

  it('la opción de promociones explica que lee las publicadas en el CRM, sin lista propia', async () => {
    await montar({ ...GUARDADO, linea: { nombre: 'Ventas', comercial: true } });
    componente['tipoNuevo'].set('PROMOCIONES');
    componente['agregar']();
    fixture.detectChanges();
    expect(texto()).toContain('Muestra las promociones publicadas para WhatsApp en Promociones');
    expect(texto()).not.toContain('Agregar promoción');
  });

  it('guardar manda el menú entero y limpio con PUT', async () => {
    await montar();
    componente['cambiar']({ saludo: '  Hola de nuevo  ' });
    const listo = componente['guardar']();
    await asentar();
    const peticion = http.expectOne(r => r.method === 'PUT' && r.url.endsWith('/menu-atencion/l-recepcion'));
    expect(peticion.request.body).toEqual({
      activo: true,
      saludo: 'Hola de nuevo',
      opciones: [
        { tipo: 'PERSONA', titulo: 'Hablar con una persona' },
        { tipo: 'EMERGENCIA', titulo: 'Es una emergencia', respuesta: 'Orientación aprobada.' },
      ],
    });
    peticion.flush({ ...GUARDADO, menu: { ...GUARDADO.menu!, saludo: 'Hola de nuevo' } });
    await listo;
    /* Se usa la respuesta del PUT: ni un GET de más ni «Cambios sin guardar» tras guardar. */
    http.expectNone(r => r.method === 'GET');
    expect(componente.sinGuardar()).toBe(false);
  });

  it('si el servidor lo rechaza, muestra cada motivo y conserva lo escrito', async () => {
    await montar();
    componente['cambiar']({ saludo: 'Saludo que no se pierde' });
    const listo = componente['guardar']();
    await asentar();
    http.expectOne(r => r.method === 'PUT').flush(
      { message: ['El menú siempre ofrece hablar con una persona.', 'Opción 2: falta el texto que se le responde.'] },
      { status: 400, statusText: 'Bad Request' },
    );
    await listo;
    fixture.detectChanges();
    expect(texto()).toContain('No se guardó');
    expect(fixture.nativeElement.querySelectorAll('[role="alert"] li')).toHaveLength(2);
    expect(borrador().saludo).toBe('Saludo que no se pierde');
  });

  it('sabe si hay cambios sin guardar, para pedir confirmación antes de cerrar', async () => {
    await montar();
    const avisos: boolean[] = [];
    componente.cambiosSinGuardar.subscribe(v => avisos.push(v));
    expect(componente.sinGuardar()).toBe(false);
    componente['cambiar']({ saludo: 'Otro saludo' });
    expect(componente.sinGuardar()).toBe(true);
    TestBed.tick();
    expect(avisos.at(-1)).toBe(true);
    /* Solo espacios de más no cuentan como cambio: no viajarían. */
    componente['cambiar']({ saludo: `  ${GUARDADO.menu!.saludo}  ` });
    expect(componente.sinGuardar()).toBe(false);
    fixture.detectChanges();
    expect(texto()).not.toContain('Cambios sin guardar');
  });

  it('quitar una opción se puede deshacer, en su lugar y con lo escrito', async () => {
    await montar();
    componente['quitar'](1);
    fixture.detectChanges();
    expect(texto()).toContain('Quitaste «Es una emergencia»');
    componente['deshacerQuitar']();
    expect(borrador().opciones[1]).toMatchObject(GUARDADO.menu!.opciones[1]);
    expect(componente['quitada']()).toBeNull();
  });

  it('deshacer no duplica un tipo único que se volvió a agregar', async () => {
    await montar();
    componente['quitar'](1);
    componente['tipoNuevo'].set('EMERGENCIA');
    componente['agregar']();
    componente['deshacerQuitar']();
    expect(borrador().opciones.filter(o => o.tipo === 'EMERGENCIA')).toHaveLength(1);
  });

  it('cada fila tiene identidad propia que no viaja al servidor: reordenar no mezcla campos', async () => {
    await montar();
    const [a, b] = borrador().opciones.map(o => o.uid);
    expect(a).toBeTruthy();
    expect(a).not.toBe(b);
    componente['mover'](0, 1);
    expect(borrador().opciones.map(o => o.uid)).toEqual([b, a]);
  });

  it('la última edición dice quién y cuándo, con la hora de la clínica', async () => {
    await montar();
    expect(texto()).toMatch(/Última edición: René · .*2026/);
  });

  it('avisa del largo mientras se escribe, con los límites de Meta', async () => {
    await montar();
    expect(componente['excede']('x'.repeat(25), 24)).toContain('Máximo 24');
    expect(componente['excede']('corto', 24)).toBeUndefined();
  });
});
