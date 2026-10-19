import { Temporal } from 'temporal-polyfill';
import { nombreDia, nombreMes } from '../../shared/models/meses';

/**
 * «Cupos» del compositor: lo que recepción elige de la agenda y el texto que
 * queda en la caja para la paciente. Funciones puras: las prueba
 * `cupos-medico.spec.ts` sin montar nada.
 *
 * Las horas salen de la misma lectura que ofrecen la web, el Flow y el
 * asistente (`/publico/agenda/disponibilidad`). Aquí no se decide qué está
 * libre ni se reserva nada: solo se redacta, y la agente lo revisa y lo manda.
 */

/** Las horas elegidas por fecha civil («2026-10-23» → «10:30», «11:00»), siempre en orden. */
export type SeleccionCupos = Readonly<Record<string, readonly string[]>>;

/** Pone o quita una hora; una fecha sin horas desaparece. No muta la selección recibida. */
export function alternarCupo(seleccion: SeleccionCupos, fecha: string, hora: string): SeleccionCupos {
  const actuales = seleccion[fecha] ?? [];
  const horas = actuales.includes(hora) ? actuales.filter(h => h !== hora) : [...actuales, hora].sort();
  const { [fecha]: _anterior, ...resto } = seleccion;
  return horas.length ? { ...resto, [fecha]: horas } : resto;
}

export function cantidadDeCupos(seleccion: SeleccionCupos): number {
  return Object.values(seleccion).reduce((total, horas) => total + horas.length, 0);
}

/** «2026-10-23» → «jueves 23 de octubre»: como se le escribe a la paciente. */
export function fechaParaPaciente(fecha: string): string {
  try {
    const d = Temporal.PlainDate.from(fecha);
    return `${nombreDia(d.dayOfWeek)} ${d.day} de ${nombreMes(d.month).toLowerCase()}`;
  } catch {
    return fecha;
  }
}

/** «10:30» · «10:30 y 11:00» · «09:00, 10:30 y 11:00». */
export function enumerarHoras(horas: readonly string[]): string {
  if (horas.length <= 1) return horas[0] ?? '';
  return `${horas.slice(0, -1).join(', ')} y ${horas[horas.length - 1]}`;
}

const mayuscula = (texto: string): string => texto.charAt(0).toUpperCase() + texto.slice(1);

/**
 * El mensaje para la paciente, de usted como el resto de los textos que recibe.
 * Vacío si no hay nada elegido. No promete la reserva: ofrece las horas y
 * pregunta, porque el cupo se ocupa recién al reservarlo.
 */
export function textoDeCupos(medico: { nombre: string; especialidad: string | null }, seleccion: SeleccionCupos): string {
  const fechas = Object.keys(seleccion).filter(f => seleccion[f].length > 0).sort();
  if (!fechas.length) return '';
  const con = medico.especialidad?.trim() ? `${medico.nombre.trim()} (${medico.especialidad.trim()})` : medico.nombre.trim();
  if (fechas.length === 1 && seleccion[fechas[0]].length === 1) {
    return `Tenemos un horario disponible con ${con}: el ${fechaParaPaciente(fechas[0])} a las ${seleccion[fechas[0]][0]}. ¿Le queda bien?`;
  }
  const lineas = fechas.map(f => `• ${mayuscula(fechaParaPaciente(f))}: ${enumerarHoras(seleccion[f])}`);
  return [`Tenemos estos horarios disponibles con ${con}:`, ...lineas, '¿Cuál le queda mejor?'].join('\n');
}
