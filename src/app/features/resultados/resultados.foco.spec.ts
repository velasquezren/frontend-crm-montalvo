import { InteractivityChecker } from '@angular/cdk/a11y';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RealtimeService } from '../../core/realtime/realtime.service';
import { EntregaResultado } from './resultado.model';
import { ResultadosPage } from './resultados.page';
import { ResultadosService } from './resultados.service';

const fila: EntregaResultado = {
  informeId: 'informe-prueba', estudio: 'Estudio de prueba', fechaEstudio: '2026-10-01',
  publicadoEn: '2026-10-01T12:00:00Z', accesoVigente: true,
  paciente: { id: 'paciente-prueba', nombre: 'Paciente de prueba', telefono: '+59170000001' },
  pacientePortal: { nombre: 'Paciente de prueba', pac: 'PAC-PRUEBA', ci: null },
  vinculo: 'PAC', sinFicha: null, aviso: null, abiertoEn: null, conversacionId: null,
};

describe('Resultados: ciclo de foco de los modales', () => {
  afterEach(() => vi.restoreAllMocks());

  it.each(['pedirConfirmacion', 'abrirTelefono', 'abrirAlta'] as const)(
    '%s captura el foco, conserva el recorrido dentro del modal y lo restaura al cancelar', async abrir => {
      TestBed.configureTestingModule({ providers: [
        provideHttpClient(), provideHttpClientTesting(), provideRouter([]),
        { provide: RealtimeService, useValue: { actividad: signal(null) } },
        { provide: ResultadosService, useValue: { pendientesRequest: () => undefined } },
      ] });
      // jsdom no calcula cajas visibles. Solo se simula esa comprobación del CDK;
      // captura, sentinelas y restauración usan la implementación real.
      vi.spyOn(TestBed.inject(InteractivityChecker), 'isVisible').mockReturnValue(true);
      const fixture = TestBed.createComponent(ResultadosPage);
      await fixture.whenStable();
      const origen: HTMLInputElement = fixture.nativeElement.querySelector('input');
      origen.focus();
      fixture.componentInstance[abrir](fila);
      await fixture.whenStable();
      const modal = document.querySelector<HTMLElement>('[role="dialog"]')!;
      expect(modal).not.toBeNull();
      const primero = modal.querySelector<HTMLElement>('input, button')!;
      expect(document.activeElement).toBe(primero);
      const centinela = modal.nextElementSibling as HTMLElement;
      expect(centinela.classList.contains('cdk-focus-trap-anchor')).toBe(true);
      centinela.focus();
      expect(document.activeElement).toBe(primero);
      const cancelar = Array.from(modal.querySelectorAll('button')).find(b => b.textContent?.trim() === 'Cancelar')!;
      cancelar.click();
      await fixture.whenStable();
      expect(document.querySelector('[role="dialog"]')).toBeNull();
      expect(document.activeElement).toBe(origen);
      fixture.destroy();
    },
  );
});
