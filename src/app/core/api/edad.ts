import { DatosExtra, textoExtra } from './datos-extra';

/**
 * Edad calculada desde la fecha de nacimiento. Es la única forma correcta de
 * obtenerla: el campo `Edad.a` que trae FileMaker es la edad del día en que se
 * capturó el registro y está desfasado hasta 18 años.
 *
 * La fecha es de CALENDARIO, no un instante: el backend la manda como
 * `1990-09-23T00:00:00.000Z`, y leída con `new Date()` en La Paz (UTC-4) eso es
 * el 22 a las 20:00 — la paciente cumplía años un día antes en pantalla. Por eso
 * el `AAAA-MM-DD` se lee tal cual y solo lo que no tenga esa forma (texto
 * suelto de FileMaker) pasa por `Date`.
 *
 * Había dos copias —esta y una en Clientes— y ya habían divergido: la de
 * Clientes no descartaba edades imposibles.
 */
export function calcularEdad(
  fechaNacimiento: string | null | undefined,
  hoy: Date = new Date(),
): string | null {
  const nacimiento = fechaDeCalendario(fechaNacimiento);
  if (!nacimiento) return null;

  let edad = hoy.getFullYear() - nacimiento.anio;
  const meses = hoy.getMonth() + 1 - nacimiento.mes;
  if (meses < 0 || (meses === 0 && hoy.getDate() < nacimiento.dia)) edad--;

  return edad >= 0 && edad < 130 ? `${edad} años` : null;
}

/**
 * La edad de una ficha: la columna y, si está vacía, la fecha que trajo la
 * importación de FileMaker. El panel del chat miraba solo la columna, así que
 * la misma paciente tenía edad en Clientes y «sin edad» en el chat.
 */
export function edadDePaciente(paciente: {
  readonly fechaNacimiento?: string | null;
  readonly datosExtra?: DatosExtra | null;
}): string | null {
  return calcularEdad(paciente.fechaNacimiento || textoExtra(paciente.datosExtra, 'fechaNacimiento', 'fn'));
}

function fechaDeCalendario(valor: string | null | undefined): { anio: number; mes: number; dia: number } | null {
  if (!valor) return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(valor);
  if (iso) return { anio: Number(iso[1]), mes: Number(iso[2]), dia: Number(iso[3]) };

  const fecha = new Date(valor);
  if (Number.isNaN(fecha.getTime())) return null;
  return { anio: fecha.getFullYear(), mes: fecha.getMonth() + 1, dia: fecha.getDate() };
}
