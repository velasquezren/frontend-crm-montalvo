import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AccionAtencion, ContextoAtencion, tiempoDeEspera } from '../../atencion-humana';
import { ConversacionesStateService } from '../../services/conversaciones-state.service';
import { AtencionHumanaComponent } from './atencion-humana.component';

const HACE_8_MIN = new Date(Date.now() - 8 * 60_000).toISOString();
const ESPERANDO: ContextoAtencion = {
  estado: 'ESPERANDO', motivo: 'SOLICITUD_EXPLICITA', prioridad: 'ALTA',
  solicitadaEn: HACE_8_MIN, tomadaEn: null, tomadaPor: null,
  origen: {
    tipo: 'seleccion', cuerpo: 'Hablar con recepción', recibidoEn: HACE_8_MIN, datos: [], versionFlow: null,
    ofrecido: { cuerpo: '¿Cómo podemos ayudarte?', opciones: ['Solicitar cita', 'Hablar con recepción'] },
  },
  ultimoMensaje: { contenido: 'Quiero confirmar mi turno', createdAt: HACE_8_MIN },
};
const CITA: ContextoAtencion = {
  ...ESPERANDO, motivo: 'SOLICITUD_CITA', prioridad: 'NORMAL',
  origen: {
    tipo: 'respuesta_flow', cuerpo: 'Solicitud de cita recibida. Pendiente: no hay ninguna cita reservada.', recibidoEn: HACE_8_MIN,
    versionFlow: 'v1', ofrecido: null,
    datos: [{ etiqueta: 'Especialidad', valor: 'Ginecología' }, { etiqueta: 'Horario preferido', valor: 'Tarde' }],
  },
  ultimoMensaje: null,
};

describe('bloque de atención humana del chat', () => {
  const cambiarAtencion = vi.fn<(accion: AccionAtencion) => Promise<void>>(async () => undefined);
  const yo = signal('rec-1');
  const admin = signal(false);

  beforeEach(() => {
    cambiarAtencion.mockClear();
    yo.set('rec-1');
    admin.set(false);
    TestBed.configureTestingModule({
      providers: [{ provide: ConversacionesStateService, useValue: {
        cambiarAtencion, cambiandoAtencion: signal<AccionAtencion | null>(null), currentUserId: yo, isAdmin: admin,
      } }],
    });
  });

  async function montar(atencion: ContextoAtencion | null, pausada: string | null = null) {
    const f = TestBed.createComponent(AtencionHumanaComponent);
    f.componentRef.setInput('atencion', atencion);
    f.componentRef.setInput('automatizacionPausadaEn', pausada);
    await f.whenStable();
    return { f, el: f.nativeElement as HTMLElement };
  }
  const botones = (el: HTMLElement) => [...el.querySelectorAll('button')].map(b => b.textContent?.trim() ?? '');

  it('en espera: dice el motivo y cuánto lleva, y ofrece tomarla', async () => {
    const { el } = await montar(ESPERANDO);
    expect(el.textContent).toContain('Pidió hablar con una persona');
    expect(el.textContent).toContain(`espera ${tiempoDeEspera(HACE_8_MIN)}`);
    const tomar = [...el.querySelectorAll('button')].find(b => b.textContent?.includes('Tomar atención'))!;
    tomar.click();
    expect(cambiarAtencion).toHaveBeenCalledWith('tomar');
    expect(botones(el).some(t => t.includes('Liberar'))).toBe(false);
  });

  it('tomada por otra persona: lo dice, y no ofrece tomarla ni liberarla', async () => {
    const { el } = await montar({ ...ESPERANDO, estado: 'EN_ATENCION', tomadaEn: HACE_8_MIN, tomadaPor: { id: 'rec-2', nombre: 'Ana Pérez' } });
    expect(el.textContent).toContain('En atención por Ana');
    expect(botones(el).some(t => t.includes('Tomar'))).toBe(false);
    expect(el.querySelector('[aria-label^="Liberar"]')).toBeNull();
  });

  it('tomada por mí: puedo liberarla', async () => {
    const { el } = await montar({ ...ESPERANDO, estado: 'EN_ATENCION', tomadaEn: HACE_8_MIN, tomadaPor: { id: 'rec-1', nombre: 'Rosa' } });
    expect(el.querySelector('[aria-label^="Liberar"]')).not.toBeNull();
  });

  it('el contexto se despliega a pedido y anuncia su estado', async () => {
    const { f, el } = await montar(ESPERANDO);
    const disclosure = el.querySelector<HTMLButtonElement>('[aria-controls="atencion-contexto"]')!;
    expect(disclosure.getAttribute('aria-expanded')).toBe('false');
    expect(el.querySelector('#atencion-contexto')).toBeNull();
    disclosure.click();
    await f.whenStable();
    expect(disclosure.getAttribute('aria-expanded')).toBe('true');
    const contexto = el.querySelector('#atencion-contexto')!;
    expect(contexto.textContent).toContain('Le ofrecimos');
    expect(contexto.textContent).toContain('Solicitar cita');
    expect(contexto.textContent).toContain('«Quiero confirmar mi turno»');
  });

  it('una solicitud de cita muestra sus datos y nunca dice que está confirmada', async () => {
    const { f, el } = await montar(CITA);
    el.querySelector<HTMLButtonElement>('[aria-controls="atencion-contexto"]')!.click();
    await f.whenStable();
    expect(el.textContent).toContain('Solicitud de cita');
    expect(el.textContent).toContain('Ginecología');
    expect(el.textContent).toContain('Tarde');
    expect(el.textContent).toContain('sin cita reservada');
    expect(el.textContent?.toLowerCase()).not.toContain('confirmada');
    expect(el.textContent).not.toMatch(/nfm_reply|response_json/);
  });

  it('al pasar a otro chat el contexto vuelve a empezar plegado', async () => {
    const { f, el } = await montar(ESPERANDO);
    f.componentRef.setInput('conversacionId', 'chat-1');
    await f.whenStable();
    el.querySelector<HTMLButtonElement>('[aria-controls="atencion-contexto"]')!.click();
    await f.whenStable();
    expect(el.querySelector('#atencion-contexto')).not.toBeNull();
    f.componentRef.setInput('conversacionId', 'chat-2');
    await f.whenStable();
    expect(el.querySelector('#atencion-contexto')).toBeNull();
  });

  it('una fecha del formulario se lee como fecha, en la zona de la clínica', async () => {
    const { f, el } = await montar({ ...CITA, origen: { ...CITA.origen!, datos: [{ etiqueta: 'Fecha preferida', valor: '2026-10-13' }] } });
    el.querySelector<HTMLButtonElement>('[aria-controls="atencion-contexto"]')!.click();
    await f.whenStable();
    expect(el.textContent).toContain('13 de octubre');
    expect(el.textContent).not.toContain('2026-10-13');
  });

  it('sin solicitud pero con la automatización pausada, ofrece reanudarla', async () => {
    const { el } = await montar(null, HACE_8_MIN);
    expect(el.textContent).toContain('Respuestas automáticas en pausa');
    [...el.querySelectorAll('button')].find(b => b.textContent?.includes('Reanudar'))!.click();
    expect(cambiarAtencion).toHaveBeenCalledWith('reanudar');
  });

  it('sin solicitud ni pausa no ocupa sitio', async () => {
    const { el } = await montar(null);
    expect(el.textContent?.trim()).toBe('');
  });
});

describe('tiempo de espera', () => {
  it('usa los mismos cortes que la bandeja y nunca dice cero', () => {
    const ahora = Date.parse('2026-10-05T12:00:00Z');
    expect(tiempoDeEspera('2026-10-05T12:00:00Z', ahora)).toBe('1 min');
    expect(tiempoDeEspera('2026-10-05T11:48:00Z', ahora)).toBe('12 min');
    expect(tiempoDeEspera('2026-10-05T09:00:00Z', ahora)).toBe('3 h');
    expect(tiempoDeEspera('2026-10-03T12:00:00Z', ahora)).toBe('2 d');
  });
});
