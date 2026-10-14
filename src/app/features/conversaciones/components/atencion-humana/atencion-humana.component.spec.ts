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
        ahora: signal(Date.now()),
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

  const abrir = async (f: { whenStable(): Promise<unknown> }, el: HTMLElement) => {
    el.querySelector<HTMLButtonElement>('[aria-controls="atencion-contexto"]')!.click();
    await f.whenStable();
  };

  const boton = (el: HTMLElement, texto: string) => [...el.querySelectorAll('button')].find(b => b.textContent?.includes(texto));

  it('en espera: qué pasó, cuánto lleva, qué hacer y un solo botón principal', async () => {
    const { el } = await montar(ESPERANDO);
    expect(el.textContent).toContain('Quiere hablar con una persona');
    expect(el.textContent).toContain(`espera ${tiempoDeEspera(HACE_8_MIN)}`);
    expect(el.textContent).toContain('Escríbele: está esperando a alguien del equipo.');
    /* Plegado: «Ver más» y «Marcar atendida». Ni tomar ni liberar a la vista. */
    expect(botones(el)).toEqual(['Ver más', 'Marcar atendida']);
    boton(el, 'Marcar atendida')!.click();
    expect(cambiarAtencion).toHaveBeenCalledWith('listo');
  });

  it('no usa la jerga interna («atención humana», «derivada», «solicitud de atención»)', async () => {
    for (const motivo of ['EMERGENCIA', 'POSIBLE_URGENCIA', 'SOLICITUD_EXPLICITA', 'DERIVADA_ASISTENTE', 'COMPROBANTE_PAGO', 'REVISION'] as const) {
      const { el } = await montar({ ...ESPERANDO, motivo });
      expect(el.textContent?.toLowerCase()).not.toMatch(/atención humana|derivad|solicitud de atención/);
    }
  });

  it('si la pasó la IA, el título dice la causa concreta y qué hacer', async () => {
    const { el } = await montar({ ...ESPERANDO, motivo: 'DERIVADA_ASISTENTE', prioridad: 'NORMAL', razonAsistente: 'MEDICO' });
    expect(el.textContent).toContain('Pregunta médica');
    expect(el.textContent).toContain('equipo clínico');
    expect(el.textContent).not.toContain('La IA te pasó este chat');
    /* Sin causa (un backend anterior), el genérico. */
    const generico = await montar({ ...ESPERANDO, motivo: 'DERIVADA_ASISTENTE', prioridad: 'NORMAL' });
    expect(generico.el.textContent).toContain('La IA te pasó este chat');
  });

  it('«La atiendo yo» está en «Ver más», para coordinarse antes de escribirle', async () => {
    const { f, el } = await montar(ESPERANDO);
    await abrir(f, el);
    expect(botones(el)).toContain('Ver menos');
    boton(el, 'La atiendo yo')!.click();
    expect(cambiarAtencion).toHaveBeenCalledWith('tomar');
    expect(el.querySelector('[aria-label^="Liberar"]')).toBeNull();
  });

  it('una emergencia se distingue también por forma, dice qué hacer y sigue marcada mientras se atiende', async () => {
    const emergencia: ContextoAtencion = { ...ESPERANDO, motivo: 'EMERGENCIA', prioridad: 'CRITICA' };
    const { el } = await montar(emergencia);
    expect(el.textContent).toContain('Dice que es una emergencia');
    expect(el.textContent).toContain('Escríbele o llámala ya');
    expect(el.querySelector('.crm-atencion--critica')).not.toBeNull();
    const atendida = await montar({ ...emergencia, estado: 'EN_ATENCION', tomadaEn: HACE_8_MIN, tomadaPor: { id: 'rec-1', nombre: 'Rosa' } });
    expect(atendida.el.querySelector('.crm-atencion--critica')).not.toBeNull();
    /* Una solicitud normal no lleva la marca. */
    expect((await montar(ESPERANDO)).el.querySelector('.crm-atencion--critica')).toBeNull();
  });

  it('tomada por otra persona: dice quién, y no ofrece tomarla ni liberarla', async () => {
    const { f, el } = await montar({ ...ESPERANDO, estado: 'EN_ATENCION', tomadaEn: HACE_8_MIN, tomadaPor: { id: 'rec-2', nombre: 'Ana Pérez' } });
    expect(el.textContent).toContain('Ana la atiende');
    await abrir(f, el);
    expect(boton(el, 'La atiendo yo')).toBeUndefined();
    expect(el.querySelector('[aria-label^="Liberar"]')).toBeNull();
  });

  it('tomada por mí: «La atiendes tú», y puedo dejarla para otra persona desde «Ver más»', async () => {
    const { f, el } = await montar({ ...ESPERANDO, estado: 'EN_ATENCION', tomadaEn: HACE_8_MIN, tomadaPor: { id: 'rec-1', nombre: 'Rosa' } });
    expect(el.textContent).toContain('La atiendes tú');
    expect(el.querySelector('[aria-label^="Liberar"]')).toBeNull();
    await abrir(f, el);
    el.querySelector<HTMLElement>('[aria-label^="Liberar"]')!.click();
    expect(cambiarAtencion).toHaveBeenCalledWith('liberar');
  });

  it('«Ver más» se despliega a pedido, anuncia su estado y muestra lo que escribió', async () => {
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
    expect(contexto.textContent).toContain('Lo que eligió');
    expect(contexto.textContent).toContain('«Quiero confirmar mi turno»');
  });

  it('sin nada que mostrar (vista provisional, ya tomada por otra) no ofrece «Ver más»', async () => {
    const { el } = await montar({ ...ESPERANDO, estado: 'EN_ATENCION', tomadaEn: HACE_8_MIN, tomadaPor: { id: 'rec-2', nombre: 'Ana' }, origen: undefined, ultimoMensaje: undefined });
    expect(el.querySelector('[aria-controls="atencion-contexto"]')).toBeNull();
    expect(botones(el)).toEqual(['Marcar atendida']);
  });

  it('una solicitud de cita muestra sus datos y nunca dice que está confirmada', async () => {
    const { f, el } = await montar(CITA);
    await abrir(f, el);
    expect(el.textContent).toContain('Pidió una cita');
    expect(el.textContent).toContain('Ginecología');
    expect(el.textContent).toContain('Tarde');
    expect(el.textContent).toContain('revisar reserva');
    expect(el.textContent?.toLowerCase()).not.toContain('confirmada');
    expect(el.textContent).not.toMatch(/nfm_reply|response_json/);
  });

  it('al pasar a otro chat «Ver más» vuelve a empezar plegado', async () => {
    const { f, el } = await montar(ESPERANDO);
    f.componentRef.setInput('conversacionId', 'chat-1');
    await f.whenStable();
    await abrir(f, el);
    expect(el.querySelector('#atencion-contexto')).not.toBeNull();
    f.componentRef.setInput('conversacionId', 'chat-2');
    await f.whenStable();
    expect(el.querySelector('#atencion-contexto')).toBeNull();
  });

  it('una fecha del formulario se lee como fecha, en la zona de la clínica', async () => {
    const { f, el } = await montar({ ...CITA, origen: { ...CITA.origen!, datos: [{ etiqueta: 'Fecha preferida', valor: '2026-10-13' }] } });
    await abrir(f, el);
    expect(el.textContent).toContain('13 de octubre');
    expect(el.textContent).not.toContain('2026-10-13');
  });

  it('sin solicitud pero con la automatización pausada, lo explica y ofrece reactivarla', async () => {
    const { el } = await montar(null, HACE_8_MIN);
    expect(el.textContent).toContain('el menú y la IA no le escriben');
    boton(el, 'Reactivar')!.click();
    expect(cambiarAtencion).toHaveBeenCalledWith('reanudar');
  });

  it('sin solicitud ni pausa no ocupa sitio', async () => {
    const { el } = await montar(null);
    expect(el.textContent?.trim()).toBe('');
  });

  it('un reclamo pasado por la IA: la causa a la vista y el mensaje que lo originó en «Ver más»', async () => {
    const { f, el } = await montar({
      ...ESPERANDO, motivo: 'DERIVADA_ASISTENTE', prioridad: 'NORMAL', razonAsistente: 'QUEJA',
      origen: { tipo: 'mensaje', cuerpo: 'No quiero otra cita, necesito revisar mi reserva.', recibidoEn: HACE_8_MIN, datos: [], versionFlow: null, ofrecido: null },
    });
    expect(el.textContent).toContain('Posible reclamo');
    expect(el.querySelector('.crm-atencion--critica')).toBeNull();
    await abrir(f, el);
    expect(el.textContent).toContain('Lo que escribió');
    expect(el.textContent).toContain('No quiero otra cita');
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
