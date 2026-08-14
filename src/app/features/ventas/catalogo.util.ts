import { CatalogoClinico, MedicoCatalogo, ServicioCatalogo } from './venta.model';

/** Catálogo vacío, para el `defaultValue` de los `httpResource`. */
export const CATALOGO_VACIO: CatalogoClinico = {
  servicios: [],
  medicos: [],
  modulos: [],
  ventasAnalizadas: 0,
};

/** Cuántas sugerencias caben sin convertir el desplegable en una lista larga. */
const MAX_SUGERENCIAS = 10;

/**
 * Compara sin acentos ni mayúsculas.
 *
 * Los nombres vienen de FileMaker tal cual se teclearon durante años:
 * "Ecografia" sin tilde, "Grupo sangu¡neo" con un carácter roto del volcado.
 * Buscar "ecografía" con tilde tiene que encontrarlos igual, porque la agente
 * escribe bien aunque el histórico no.
 */
export function normalizar(texto: string): string {
  return texto
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

/**
 * Servicios que encajan con lo tecleado, los más vendidos primero.
 *
 * Sin texto devuelve los más frecuentes: en esta clínica eso son consulta
 * externa, hemograma y ecografía, que resuelven la mayoría de los registros sin
 * escribir nada.
 */
export function filtrarServicios(
  catalogo: CatalogoClinico,
  termino: string,
): readonly ServicioCatalogo[] {
  const buscado = normalizar(termino);
  if (!buscado) return catalogo.servicios.slice(0, MAX_SUGERENCIAS);
  return catalogo.servicios
    .filter(s => normalizar(s.nombre).includes(buscado))
    .slice(0, MAX_SUGERENCIAS);
}

/** Médicos del histórico que encajan; vacío mientras no se escriba nada. */
export function filtrarMedicos(
  catalogo: CatalogoClinico,
  termino: string,
): readonly MedicoCatalogo[] {
  const buscado = normalizar(termino);
  if (!buscado) return [];
  return catalogo.medicos
    .filter(m => normalizar(m.nombre).includes(buscado) && normalizar(m.nombre) !== buscado)
    .slice(0, 6);
}

/**
 * Módulo que le corresponde a lo tecleado, o `null` si no es un servicio
 * conocido.
 *
 * Sustituye al selector de "especialidad" que había escrito a mano: sus ocho
 * categorías no existían en FileMaker, cuyos módulos reales son cuatro y
 * operativos (LABORATORIO, CONSULTA, PLANES, INTERNACION). Deducirlo del
 * servicio quita un clic y hace que lo que se guarda venga del dato.
 *
 * Devuelve `null` para un servicio nuevo que aún no está en el histórico: es
 * preferible guardar el módulo vacío a inventarle una categoría.
 */
export function moduloDeServicio(catalogo: CatalogoClinico, termino: string): string | null {
  const buscado = normalizar(termino);
  if (!buscado) return null;
  return catalogo.servicios.find(s => normalizar(s.nombre) === buscado)?.modulo ?? null;
}
