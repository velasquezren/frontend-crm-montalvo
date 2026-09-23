import { describe, expect, it } from 'vitest';

import { cajaImagen } from './caja-imagen';

describe('cajaImagen', () => {
  it('una foto vertical de WhatsApp (1200×1600) cabe por alto y conserva su proporción', () => {
    expect(cajaImagen(1200, 1600)).toEqual({ ancho: 216, alto: 288, recortar: false });
  });

  it('una horizontal cabe por ancho', () => {
    expect(cajaImagen(1600, 900)).toEqual({ ancho: 260, alto: 146, recortar: false });
  });

  it('una imagen pequeña no se agranda', () => {
    expect(cajaImagen(200, 150)).toEqual({ ancho: 200, alto: 150, recortar: false });
  });

  it('una tira extrema no queda más fina que lo legible', () => {
    expect(cajaImagen(4000, 100).alto).toBe(96);
  });

  it('sin medidas reserva igual una caja fija', () => {
    expect(cajaImagen(null, null)).toEqual({ ancho: 240, alto: 240, recortar: true });
  });
});
