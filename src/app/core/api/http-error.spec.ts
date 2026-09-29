import { HttpErrorResponse } from '@angular/common/http';
import { describe, expect, it } from 'vitest';

import { campoEnConflicto, choqueDe, esConflicto, mensajeDeError } from './http-error';

/**
 * Cómo se lee un error del backend. Lo que se prueba aquí es lo que decide si
 * un rechazo sale como error rojo o como un dato que corregir en el campo.
 */

const conflicto = (cuerpo: unknown) => new HttpErrorResponse({ status: 409, error: cuerpo });

describe('mensajeDeError', () => {
  it('saca el texto que manda Nest', () => {
    expect(mensajeDeError(conflicto({ message: 'El teléfono +59170000001 ya es de Ana Pérez.' }), 'respaldo')).toBe(
      'El teléfono +59170000001 ya es de Ana Pérez.',
    );
  });

  it('junta los errores de validación, que vienen en lista', () => {
    expect(mensajeDeError(new HttpErrorResponse({ status: 400, error: { message: ['Falta el nombre', 'Teléfono inválido'] } }), 'r')).toBe(
      'Falta el nombre. Teléfono inválido',
    );
  });

  /* Sin esto, un servidor caído decía el respaldo genérico de cada pantalla y
     nadie sabía que el problema era la conexión. */
  it('distingue el servidor que no contesta', () => {
    expect(mensajeDeError(new HttpErrorResponse({ status: 0 }), 'respaldo')).toContain('conexión');
  });
});

describe('esConflicto', () => {
  it('reconoce el 409', () => {
    expect(esConflicto(conflicto({ message: 'ya existe' }))).toBe(true);
  });

  /* Un 400 es un dato mal escrito y un 500 es un fallo: ninguno se resuelve
     señalando el campo con «ya es de otro paciente». */
  it('no confunde un 400 ni un 500 con un duplicado', () => {
    expect(esConflicto(new HttpErrorResponse({ status: 400 }))).toBe(false);
    expect(esConflicto(new HttpErrorResponse({ status: 500 }))).toBe(false);
    expect(esConflicto(new Error('algo'))).toBe(false);
  });
});

describe('campoEnConflicto', () => {
  it('dice qué campo rebotó cuando el backend lo manda', () => {
    expect(campoEnConflicto(conflicto({ message: 'x', campo: 'telefono' }))).toBe('telefono');
    expect(campoEnConflicto(conflicto({ message: 'x', campo: 'pac' }))).toBe('pac');
  });

  /* El backend viejo no lo manda, y un error de red no trae cuerpo. En los dos
     casos hay que quedarse sin marcar campo, no marcar el equivocado. */
  it('devuelve undefined si no viene, o si no es un texto', () => {
    expect(campoEnConflicto(conflicto({ message: 'x' }))).toBeUndefined();
    expect(campoEnConflicto(conflicto({ campo: 7 }))).toBeUndefined();
    expect(campoEnConflicto(conflicto({ campo: '' }))).toBeUndefined();
    expect(campoEnConflicto(new HttpErrorResponse({ status: 0 }))).toBeUndefined();
    expect(campoEnConflicto('no es un error http')).toBeUndefined();
  });
});

describe('choqueDe', () => {
  const choque = { valor: '+59170000001', mensaje: 'El teléfono +59170000001 ya es de Ana Pérez.' };

  it('avisa mientras siga escrito el valor que el servidor rechazó', () => {
    expect(choqueDe(choque, '+59170000001')).toBe(choque.mensaje);
  });

  /* Lo importante de toda esta prueba: el aviso desaparece al corregir el dato
     sin que nadie tenga que acordarse de limpiarlo. */
  it('se borra solo en cuanto el valor cambia', () => {
    expect(choqueDe(choque, '+59170000002')).toBeUndefined();
    expect(choqueDe(choque, null)).toBeUndefined();
  });

  it('sin choque previo no dice nada', () => {
    expect(choqueDe(null, '+59170000001')).toBeUndefined();
  });
});
