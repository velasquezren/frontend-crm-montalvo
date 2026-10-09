import { createEnvironmentInjector, EnvironmentInjector, Injector, runInInjectionContext } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { diaClinicaVivo } from './dia-clinica';

describe('diaClinicaVivo', () => {
  afterEach(() => vi.useRealTimers());

  it('cambia sola a la medianoche de La Paz, no a la del navegador', () => {
    vi.useFakeTimers();
    /* 23:58 en La Paz (UTC-4) del 9 de octubre. */
    vi.setSystemTime(new Date('2026-10-10T03:58:00Z'));
    const dia = runInInjectionContext(TestBed.inject(Injector), () => diaClinicaVivo());
    expect(dia()).toBe('2026-10-09');

    vi.advanceTimersByTime(60_000);
    expect(dia()).toBe('2026-10-09');
    vi.advanceTimersByTime(2 * 60_000);
    expect(dia()).toBe('2026-10-10');
  });

  it('el temporizador muere con quien lo creó', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-10T03:58:00Z'));
    const injector = createEnvironmentInjector([], TestBed.inject(EnvironmentInjector));
    const dia = runInInjectionContext(injector, () => diaClinicaVivo());

    injector.destroy();
    vi.advanceTimersByTime(5 * 60_000);
    expect(dia()).toBe('2026-10-09');
    expect(vi.getTimerCount()).toBe(0);
  });
});
