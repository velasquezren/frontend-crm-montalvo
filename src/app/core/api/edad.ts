/**
 * Edad calculada desde la fecha de nacimiento. Es la única forma correcta de
 * obtenerla: el campo `Edad.a` que trae FileMaker es la edad del día en que se
 * capturó el registro y está desfasado hasta 18 años.
 */
export function calcularEdad(fechaNacimiento: string | null | undefined): string | null {
  if (!fechaNacimiento) return null;
  const nacimiento = new Date(fechaNacimiento);
  if (Number.isNaN(nacimiento.getTime())) return null;

  const hoy = new Date();
  let edad = hoy.getFullYear() - nacimiento.getFullYear();
  const meses = hoy.getMonth() - nacimiento.getMonth();
  if (meses < 0 || (meses === 0 && hoy.getDate() < nacimiento.getDate())) edad--;

  return edad >= 0 && edad < 130 ? `${edad} años` : null;
}
