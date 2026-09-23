import { describe, expect, it } from 'vitest';

import { buscarAtajos, insertarEnCursor, rellenarNombre } from './atajos';
import { PlantillaAgente } from './conversacion.model';

const p = (titulo: string, atajo: string | null): PlantillaAgente => ({
  id: titulo, usuarioId: 'u', titulo, atajo, contenido: `texto de ${titulo}`, tags: [], createdAt: '', updatedAt: '',
});
const plantillas = [p('Horarios y ubicación', '/horarios'), p('Precios ecografía', 'eco'), p('Saludo', null)];

describe('atajos con /', () => {
  it('solo cuando el mensaje entero es un comando', () => {
    expect(buscarAtajos('/', plantillas)).toHaveLength(3);
    expect(buscarAtajos('tome 1/2 comprimido', plantillas)).toEqual([]);
    expect(buscarAtajos('/hor y más', plantillas)).toEqual([]);
  });

  it('coincide por atajo (con o sin barra guardada) y por título', () => {
    expect(buscarAtajos('/hor', plantillas).map(x => x.titulo)).toEqual(['Horarios y ubicación']);
    expect(buscarAtajos('/ECO', plantillas).map(x => x.titulo)).toEqual(['Precios ecografía']);
    expect(buscarAtajos('/salu', plantillas).map(x => x.titulo)).toEqual(['Saludo']);
  });
});

describe('rellenar {{nombre}}', () => {
  it('con el nombre de pila', () => {
    expect(rellenarNombre('Hola {{nombre}}, bienvenida', { nombre: 'María Pérez' })).toBe('Hola María, bienvenida');
  });

  it('sin nombre real no saluda «Hola WhatsApp»', () => {
    expect(rellenarNombre('Hola {{nombre}}, bienvenida', { nombre: 'WhatsApp +59171836560' })).toBe('Hola, bienvenida');
  });
});

describe('insertar en el cursor', () => {
  it('no borra el borrador', () => {
    expect(insertarEnCursor('Buenas tardes.', 'Le paso los horarios.', 14, 14)).toEqual({
      texto: 'Buenas tardes. Le paso los horarios.',
      cursor: 36,
    });
  });

  it('reemplaza la selección', () => {
    expect(insertarEnCursor('Hola XXX gracias', 'María', 5, 8).texto).toBe('Hola María gracias');
  });
});
