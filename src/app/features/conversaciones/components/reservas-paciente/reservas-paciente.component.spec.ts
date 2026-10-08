import '@angular/compiler';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it } from 'vitest';

import { ReservaAgenda } from '../../../reservas/reserva.model';
import { ReservasPacienteComponent } from './reservas-paciente.component';

describe('próximas reservas en la ficha del chat', () => {
  let fixture: ComponentFixture<ReservasPacienteComponent>;
  let http: HttpTestingController;
  async function asentar() {
    for (let i = 0; i < 4; i++) { await Promise.resolve(); TestBed.tick(); }
    fixture.detectChanges();
  }
  async function montar(id = 'chat-1') {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])] });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(ReservasPacienteComponent);
    fixture.componentRef.setInput('conversacionId', id);
    fixture.detectChanges();
    await asentar();
  }
  afterEach(() => { fixture?.destroy(); http.verify(); });

  it('las de esta paciente, con fecha, médico y estado', async () => {
    await montar();
    const r: Partial<ReservaAgenda> = { id: 7, fecha: '2026-10-13', hora: '09:30', medicoId: 3, medico: 'Dra. Sintética', especialidad: 'Ginecología', estado: 'PENDIENTE' };
    http.expectOne(p => p.url.endsWith('/agenda/reservas/conversacion/chat-1')).flush([r]);
    await asentar();
    const texto = (fixture.nativeElement as HTMLElement).textContent!;
    expect(texto).toContain('mar 13 oct · 09:30');
    expect(texto).toContain('Dra. Sintética · Ginecología');
    expect(texto).toContain('Por confirmar');
    expect((fixture.nativeElement as HTMLElement).querySelector('a[href="/directorio?medico=3"]')).not.toBeNull();
  });

  it('sin reservas lo dice; si la agenda no responde, lo dice también y no rompe el chat', async () => {
    await montar();
    http.expectOne(p => p.url.endsWith('/conversacion/chat-1')).flush([]);
    await asentar();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Sin reservas próximas');

    fixture.componentRef.setInput('conversacionId', 'chat-2');
    await asentar();
    http.expectOne(p => p.url.endsWith('/conversacion/chat-2')).flush({}, { status: 503, statusText: 'Unavailable' });
    await asentar();
    const texto = (fixture.nativeElement as HTMLElement).textContent!;
    expect(texto).toContain('No pudimos consultar la agenda');
    expect(texto).not.toContain('Sin reservas próximas');
  });
});
