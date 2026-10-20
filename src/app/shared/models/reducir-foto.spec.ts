import { describe, expect, it } from 'vitest';

import { dimensionesReducidas, LADO_MAXIMO_FOTO, reducirFoto } from './reducir-foto';

describe('reducir la foto antes de subirla al chat', () => {
  it('una foto de teléfono baja a 2560 px de lado, sin deformarse', () => {
    expect(dimensionesReducidas(4000, 3000)).toEqual({ ancho: LADO_MAXIMO_FOTO, alto: 1920 });
    expect(dimensionesReducidas(3000, 4000)).toEqual({ ancho: 1920, alto: LADO_MAXIMO_FOTO });
  });

  it('nunca agranda una imagen que ya es pequeña', () => {
    expect(dimensionesReducidas(1200, 800)).toEqual({ ancho: 1200, alto: 800 });
  });

  /* Achicar es una mejora, nunca un motivo para no poder adjuntar. */
  it('un PDF, una captura PNG o una foto pequeña salen tal cual', async () => {
    const pdf = new File([new Uint8Array(2_000_000)], 'informe.pdf', { type: 'application/pdf' });
    const png = new File([new Uint8Array(2_000_000)], 'captura.png', { type: 'image/png' });
    const chica = new File([new Uint8Array(100_000)], 'foto.jpg', { type: 'image/jpeg' });
    for (const archivo of [pdf, png, chica]) expect(await reducirFoto(archivo)).toBe(archivo);
  });

  it('sin soporte del navegador para decodificarla, sube la original', async () => {
    const rota = new File([new Uint8Array(2_000_000)], 'foto.jpg', { type: 'image/jpeg' });
    expect(await reducirFoto(rota)).toBe(rota);
  });
});
