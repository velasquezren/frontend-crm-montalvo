import { describe, expect, it } from 'vitest';

import { enlaceLlamada, enlaceWhatsApp, soloDigitos, telefonoParaEscribir } from './telefono';

/*
 * El caso que obliga a que esto exista es el de la paciente extranjera. Dos de
 * las cuatro copias que esto sustituye anteponían `591` «si no lo tenía», y con
 * un número de México eso producía `wa.me/5915215512345678`: el prefijo de
 * Bolivia pegado delante de un número que ya traía el suyo. El enlace no
 * fallaba con un error — abría un chat con un número que no existe.
 */
describe('enlaceWhatsApp', () => {
  it('limpia los símbolos de un número boliviano', () => {
    expect(enlaceWhatsApp('+591 71836560')).toBe('https://wa.me/59171836560');
    expect(enlaceWhatsApp('+591-718-365-60')).toBe('https://wa.me/59171836560');
  });

  it('NO le antepone 591 a una paciente extranjera', () => {
    expect(enlaceWhatsApp('+52 1 55 1234 5678')).toBe('https://wa.me/5215512345678');
    expect(enlaceWhatsApp('+1 305 555 0123')).toBe('https://wa.me/13055550123');
  });

  it('no duplica el prefijo de un número que ya lo trae', () => {
    expect(enlaceWhatsApp('+59176300126')).toBe('https://wa.me/59176300126');
  });

  it('adjunta un mensaje ya escrito, codificado', () => {
    expect(enlaceWhatsApp('+59171836560', 'Hola, ¿cómo está?')).toBe(
      'https://wa.me/59171836560?text=Hola%2C%20%C2%BFc%C3%B3mo%20est%C3%A1%3F',
    );
  });

  it('sin número devuelve cadena vacía, no un enlace roto', () => {
    expect(enlaceWhatsApp(undefined)).toBe('');
    expect(enlaceWhatsApp(null)).toBe('');
    expect(enlaceWhatsApp('')).toBe('');
    expect(enlaceWhatsApp('sin dígitos')).toBe('');
  });
});

describe('enlaceLlamada', () => {
  it('conserva el `+` para que el marcador no pierda el país', () => {
    expect(enlaceLlamada('+591 71836560')).toBe('tel:+59171836560');
    expect(enlaceLlamada('+52 1 55 1234 5678')).toBe('tel:+5215512345678');
  });

  it('sin número devuelve cadena vacía', () => {
    expect(enlaceLlamada(null)).toBe('');
  });
});

describe('soloDigitos', () => {
  it('quita todo lo que no sea cifra', () => {
    expect(soloDigitos('+591 (718) 365-60')).toBe('59171836560');
  });
});

describe('telefonoParaEscribir', () => {
  it('reconoce un celular boliviano escrito de cualquier forma', () => {
    expect(telefonoParaEscribir('700 12-345')).toBe('+59170012345');
    expect(telefonoParaEscribir('59170012345')).toBe('+59170012345');
    expect(telefonoParaEscribir('+591 70012345')).toBe('+59170012345');
  });

  it('respeta otros países y descarta lo que no es un teléfono', () => {
    expect(telefonoParaEscribir('+34 612 345 678')).toBe('+34612345678');
    expect(telefonoParaEscribir('María')).toBeNull();
    expect(telefonoParaEscribir('1234')).toBeNull();
  });
});
