import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { InteraccionPreviewComponent, InteraccionVista } from './interaccion-preview.component';

async function montar(vista: InteraccionVista | null, habilitada = true, cargando = false) {
  const f = TestBed.createComponent(InteraccionPreviewComponent);
  f.componentRef.setInput('interaccion', vista);
  f.componentRef.setInput('habilitada', habilitada);
  f.componentRef.setInput('cargando', cargando);
  await f.whenStable();
  return f.nativeElement as HTMLElement;
}
describe('previsualización aislada de interacciones', () => {
  it('en historial muestra selección y correlación sin llamarla demostración', async () => {
    const f = TestBed.createComponent(InteraccionPreviewComponent);
    f.componentRef.setInput('habilitada', true);
    f.componentRef.setInput('historial', true);
    f.componentRef.setInput('interaccion', { tipo: 'seleccion', cuerpo: 'Recepción', estado: 'CORRELACIONADA', seleccionId: 'TALK_TO_HUMAN' });
    await f.whenStable();
    const el = f.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Recepción');
    expect(el.textContent).toContain('Respuesta vinculada');
    expect(el.textContent).not.toContain('Demostración');
    f.componentRef.setInput('interaccion', { tipo: 'seleccion', cuerpo: 'Recepción', estado: 'CADUCADA' });
    await f.whenStable();
    expect(el.textContent).toContain('había caducado');
    expect(el.querySelector('button')).toBeNull();
  });
  it('no se activa por defecto', async () => {
    const f = TestBed.createComponent(InteraccionPreviewComponent);
    await f.whenStable();
    expect((f.nativeElement as HTMLElement).querySelector('section')).toBeNull();
  });
  it('representa botones sin posibilidad de enviar', async () => {
    const el = await montar({
      tipo: 'botones',
      cuerpo: '[DEMO] Menú',
      opciones: [{ id: 'BOOK_APPOINTMENT', titulo: 'Solicitar cita' }],
    });
    const boton = el.querySelector('button');
    expect(boton?.disabled).toBe(true);
    expect(boton?.textContent).toContain('Solicitar cita');
  });
  it('muestra lista y referencias de selección con detalle nativo accesible', async () => {
    const el = await montar({
      tipo: 'lista',
      cuerpo: 'Opciones',
      opciones: [{ id: 'VIEW_SERVICES', titulo: 'Servicios', descripcion: 'Sin precios reales' }],
      seleccionId: 'VIEW_SERVICES',
      contextoId: 'wamid.synthetic',
    });
    expect(el.querySelectorAll('li')).toHaveLength(1);
    expect(el.querySelector('summary')?.textContent).toContain('Ver referencias');
    expect(el.textContent).toContain('VIEW_SERVICES');
  });
  it('Flow recibido no se presenta como cita confirmada', async () => {
    const el = await montar({ tipo: 'respuesta_flow', cuerpo: 'Solicitud de cita' });
    expect(el.textContent).toContain('no confirma una cita');
    expect(el.textContent).toContain('Demostración local');
  });
  it('no interpreta HTML del mensaje ni abre recursos remotos', async () => {
    const el = await montar({
      tipo: 'seleccion',
      cuerpo: '<img src=x onerror=alert(1)>',
      seleccionId: 'SYNTHETIC',
    });
    expect(el.querySelector('img')).toBeNull();
    expect(el.textContent).toContain('<img');
  });
  it('diferencia carga, ausencia y error', async () => {
    expect((await montar(null, true, true)).textContent).toContain('Preparando');
    expect((await montar(null)).textContent).toContain('No hay');
    expect((await montar({ tipo: 'error', cuerpo: 'Respuesta inválida' })).textContent).toContain(
      'Requiere revisión humana',
    );
  });
});
