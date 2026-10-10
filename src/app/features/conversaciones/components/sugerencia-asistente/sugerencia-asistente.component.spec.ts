import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SugerenciaDelChat } from '../../asistente-chat';
import { ConversacionesStateService } from '../../services/conversaciones-state.service';
import { SugerenciaAsistenteComponent } from './sugerencia-asistente.component';

const SUGERENCIA: SugerenciaDelChat = {
  id: 's1', texto: 'El *Control prenatal* está a Bs 280.', aviso: null, createdAt: '2026-10-10T15:00:00Z',
  acciones: [{ tipo: 'PROMOCION', titulo: 'Control prenatal', promocionId: 'p1' }, { tipo: 'HORARIO', titulo: 'Dra. Rojas', medicoId: 7 }],
};

describe('la sugerencia del asistente sobre la caja de texto', () => {
  const sugerencia = signal<SugerenciaDelChat | null>(SUGERENCIA);
  const estado = {
    sugerencia,
    procesandoSugerencia: signal<string | number | null>(null),
    usarSugerencia: vi.fn(async () => undefined),
    descartarSugerencia: vi.fn(async () => undefined),
    enviarAccionSugerida: vi.fn(async () => undefined),
  };

  beforeEach(() => {
    sugerencia.set(SUGERENCIA);
    vi.clearAllMocks();
    TestBed.configureTestingModule({ providers: [{ provide: ConversacionesStateService, useValue: estado }] });
  });

  async function montar() {
    const f = TestBed.createComponent(SugerenciaAsistenteComponent);
    await f.whenStable();
    return { f, el: f.nativeElement as HTMLElement };
  }
  const boton = (el: HTMLElement, t: string) => [...el.querySelectorAll('button')].find(b => (b.textContent ?? '').includes(t) || b.getAttribute('aria-label')?.includes(t));

  it('sin sugerencia no ocupa lugar', async () => {
    sugerencia.set(null);
    const { el } = await montar();
    expect(el.querySelector('section')).toBeNull();
  });

  it('«Usar y revisar» la lleva a la caja: no la envía', async () => {
    const { el } = await montar();
    expect(el.textContent).toContain('El *Control prenatal* está a Bs 280.');
    boton(el, 'Usar y revisar')!.click();
    expect(estado.usarSugerencia).toHaveBeenCalledTimes(1);
    expect(estado.enviarAccionSugerida).not.toHaveBeenCalled();
  });

  it('cada acción dice qué manda y se envía por su índice', async () => {
    const { el } = await montar();
    boton(el, 'Enviar horario: Dra. Rojas')!.click();
    expect(estado.enviarAccionSugerida).toHaveBeenCalledWith(1);
  });

  it('una consulta médica muestra solo el aviso: sin texto, no hay «Usar»', async () => {
    sugerencia.set({ ...SUGERENCIA, texto: '', acciones: [], aviso: 'Consulta médica: la tiene que responder una persona.' });
    const { el } = await montar();
    expect(el.textContent).toContain('Consulta médica');
    expect(boton(el, 'Usar y revisar')).toBeUndefined();
    boton(el, 'Descartar la sugerencia')!.click();
    expect(estado.descartarSugerencia).toHaveBeenCalled();
  });
});
