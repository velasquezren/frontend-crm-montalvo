import { esNombreProvisional } from '../../shared/models/nombre-cliente';
import { PlantillaAgente } from './conversacion.model';

/** Tope de sugerencias: más de seis no se leen de un vistazo encima del teclado. */
const MAX_SUGERENCIAS = 6;

/**
 * Respuestas rápidas que coinciden con lo que se está tecleando como atajo.
 *
 * Solo cuando el mensaje entero es `/algo` —como en Slack—: una barra en mitad
 * de una frase («1/2 comprimido») no es un comando. Coincide por el atajo
 * (desde el principio) o por el título (en cualquier parte), sin distinguir
 * mayúsculas ni la barra con que se guardó el atajo.
 */
export function buscarAtajos(texto: string, plantillas: readonly PlantillaAgente[]): PlantillaAgente[] {
  const comando = /^\/(\S*)$/.exec(texto);
  if (!comando) return [];
  const q = comando[1].toLowerCase();
  return plantillas
    .filter(p => {
      const atajo = (p.atajo ?? '').toLowerCase().replace(/^\//, '');
      return (atajo && atajo.startsWith(q)) || p.titulo.toLowerCase().includes(q);
    })
    .slice(0, MAX_SUGERENCIAS);
}

/**
 * Rellena `{{nombre}}` con el nombre de pila del paciente.
 *
 * Un contacto que escribió sin dar su nombre se guarda como «WhatsApp
 * +591…»: rellenar con eso saludaba «Hola WhatsApp». Sin nombre real se quita
 * el marcador y el espacio o la coma que quedaban colgando: «Hola {{nombre}},»
 * queda «Hola,».
 */
export function rellenarNombre(contenido: string, cliente: { nombre: string } | null | undefined): string {
  const nombre = cliente && !esNombreProvisional(cliente.nombre) ? cliente.nombre.trim().split(/\s+/)[0] : '';
  const marcador = /\{\{\s*nombre\s*\}\}/gi;
  return nombre ? contenido.replace(marcador, nombre) : contenido.replace(/[ \t]*\{\{\s*nombre\s*\}\}/gi, '').replace(marcador, '');
}

/**
 * Inserta un texto donde está el cursor, en vez de reemplazar el borrador.
 * Tocar una respuesta rápida borraba lo que la agente ya había escrito.
 */
export function insertarEnCursor(actual: string, insercion: string, inicio: number, fin: number): { texto: string; cursor: number } {
  const antes = actual.slice(0, inicio);
  const despues = actual.slice(fin);
  const separador = antes && !/\s$/.test(antes) ? ' ' : '';
  const texto = `${antes}${separador}${insercion}${despues}`;
  return { texto, cursor: (antes + separador + insercion).length };
}
