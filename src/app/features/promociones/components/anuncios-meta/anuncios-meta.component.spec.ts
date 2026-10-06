import '@angular/compiler';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { paginaVacia } from '../../../../core/api/pagination.model';
import { AnunciosMetaComponent } from './anuncios-meta.component';

const anuncio = { anuncioId: '120252504666670704', leads: 247, ultimoEn: '2026-09-30T12:00:00Z', titular: 'Clínica Montalvo', imagenUrl: 'https://scontent.invalid/a.jpg' };

describe('anuncios de Meta', () => {
  let fixture: ComponentFixture<AnunciosMetaComponent>;
  let http: HttpTestingController;
  async function asentar() {
    for (let i = 0; i < 4; i++) { await Promise.resolve(); TestBed.tick(); }
  }
  beforeEach(async () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(AnunciosMetaComponent);
    fixture.detectChanges();
    await asentar();
    http.expectOne(r => r.url.endsWith('/anuncios/sin-promocion')).flush({ ...paginaVacia(), datos: [anuncio], total: 1 });
    http.expectOne(r => r.url.endsWith('/promociones')).flush(paginaVacia());
    await asentar();
    fixture.detectChanges();
  });
  afterEach(() => { fixture.destroy(); http.verify(); });

  it('la imagen se ve entera y se amplía con un clic', () => {
    const boton = fixture.nativeElement.querySelector('button.anuncio-miniatura') as HTMLButtonElement;
    expect(boton.getAttribute('aria-label')).toContain('Clínica Montalvo');
    boton.click();
    expect(fixture.componentInstance['ampliada']()).toEqual({ url: anuncio.imagenUrl, titulo: 'Clínica Montalvo' });
  });

  it('si la URL de Meta caducó, queda el ícono y no un hueco', () => {
    fixture.nativeElement.querySelector('img').dispatchEvent(new Event('error'));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('button.anuncio-miniatura')).toBeNull();
    expect(fixture.nativeElement.querySelector('span.anuncio-miniatura')?.getAttribute('title')).toContain('ya no está disponible');
  });
});
