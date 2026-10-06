import { describe, expect, it } from 'vitest';

import { BYTES_MAXIMOS_IMAGEN, fechaCorta, precioDeTexto, problemaDeImagen } from './catalogo';

describe('funciones del catálogo', () => {
  it('precio tecleado: acepta coma o punto, vacío es «sin precio», lo demás no es un precio', () => {
    expect(precioDeTexto('480')).toBe(480);
    expect(precioDeTexto('480,50')).toBe(480.5);
    expect(precioDeTexto(' 1 200 ')).toBe(1200);
    expect(precioDeTexto('')).toBeNull();
    expect(precioDeTexto('480,555')).toBeUndefined();
    expect(precioDeTexto('Bs 480')).toBeUndefined();
    expect(precioDeTexto('-5')).toBeUndefined();
  });

  it('imagen: tipo y tope del backend, avisados antes de subir', () => {
    expect(problemaDeImagen({ type: 'image/png', size: 1000 })).toBeNull();
    expect(problemaDeImagen({ type: 'image/svg+xml', size: 1000 })).toMatch(/JPG, PNG o WebP/);
    expect(problemaDeImagen({ type: 'image/jpeg', size: BYTES_MAXIMOS_IMAGEN + 1 })).toMatch(/5 MB/);
  });

  it('fecha de calendario sin hora: no se corre un día por la zona del navegador', () => {
    expect(fechaCorta('2026-10-01')).toBe('1 oct 2026');
    expect(fechaCorta('2026-12-31')).toBe('31 dic 2026');
    expect(fechaCorta(null)).toBe('sin fecha de fin');
  });
});
