import { describe, expect, it } from 'vitest';

import { esNombreProvisional, inicialesCliente, nombreParaMostrar } from './nombre-cliente';

/*
 * Estas tres funciones deciden cómo se escribe una paciente en pantalla, y las
 * usan seis vistas a través de dos pipes. Son puras y de dos líneas, así que la
 * tentación es no probarlas — pero lo que fijan es un CONTRATO con el backend:
 * el prefijo exacto con el que `ClientesService.nombreProvisional` da de alta a
 * quien escribe sin dar su nombre. Si ese prefijo cambia allá y no acá, no falla
 * nada: simplemente vuelve a aparecer "WhatsApp +591…" donde va un nombre, en
 * las seis vistas a la vez y sin que nadie se entere.
 */

const CONTACTO = { nombre: 'María Pérez Gutiérrez', telefono: '+59171836560' };
const SIN_NOMBRE = { nombre: 'WhatsApp +59171836560', telefono: '+59171836560' };

describe('esNombreProvisional', () => {
  it('reconoce el marcador que pone el backend', () => {
    expect(esNombreProvisional(SIN_NOMBRE.nombre)).toBe(true);
  });

  it('no toca un nombre de persona', () => {
    expect(esNombreProvisional(CONTACTO.nombre)).toBe(false);
  });

  it('no se deja engañar por un nombre que MENCIONA WhatsApp', () => {
    /* El marcador es un PREFIJO. Una paciente que de verdad se apellide así, o
       una nota pegada en el nombre, no es un contacto sin nombre. */
    expect(esNombreProvisional('Ana WhatsApp')).toBe(false);
    expect(esNombreProvisional('Clínica WhatsApp Business')).toBe(false);
  });
});

describe('nombreParaMostrar', () => {
  it('devuelve el nombre real cuando lo hay', () => {
    expect(nombreParaMostrar(CONTACTO)).toBe('María Pérez Gutiérrez');
  });

  it('devuelve el teléfono, sin la palabra WhatsApp, cuando no lo hay', () => {
    expect(nombreParaMostrar(SIN_NOMBRE)).toBe('+59171836560');
  });

  it('nunca devuelve el marcador crudo — es lo único que no puede pasar', () => {
    expect(nombreParaMostrar(SIN_NOMBRE)).not.toContain('WhatsApp');
  });
});

describe('inicialesCliente', () => {
  it('dos iniciales de un nombre de persona', () => {
    expect(inicialesCliente(CONTACTO)).toBe('MP');
  });

  it('un interrogante cuando no hay nombre, no las letras del marcador', () => {
    /* `generarIniciales('WhatsApp +59171836560')` da "W+", que no son las
       iniciales de nadie: son la inicial del canal y el signo del prefijo
       internacional. Ese era el avatar que el usuario señaló. */
    expect(inicialesCliente(SIN_NOMBRE)).toBe('?');
    expect(inicialesCliente(SIN_NOMBRE)).not.toBe('W+');
  });

  it('coincide con lo que muestra nombreParaMostrar', () => {
    /* Las dos caras de la misma regla: si una vista pinta el teléfono como
       título, el avatar no puede seguir mostrando iniciales inventadas. */
    for (const contacto of [CONTACTO, SIN_NOMBRE]) {
      const esMarcador = nombreParaMostrar(contacto) === contacto.telefono;
      expect(inicialesCliente(contacto) === '?').toBe(esMarcador);
    }
  });
});
