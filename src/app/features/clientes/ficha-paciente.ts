import { DatosExtra, listaExtra, textoExtra } from '../../core/api/datos-extra';
import { ActualizarClienteDto } from './clientes.service';

/**
 * La ficha del paciente tal como la edita una persona: lo que se muestra al
 * abrirla y lo que se manda al guardar.
 *
 * **Había dos editores con dos reglas**: el cajón de Clientes y el panel del
 * chat. Cada uno leía y guardaba la ficha a su manera, y ya se contradecían en
 * lo que la agente ve:
 *
 * - En el chat, borrar Empresa, Lugar o Fecha mandaba `undefined` —«no tocar
 *   este campo»— y el backend dejaba la columna como estaba: el dato borrado
 *   seguía en pantalla al recargar.
 * - El chat además copiaba esos tres campos en `datosExtra`, que es justo lo
 *   que el backend dejó de hacer porque la ficha lee la columna.
 * - El chat no mostraba la fecha de nacimiento que vino de FileMaker (`fn`).
 * - Clientes copiaba los intereses dentro del campo Etiquetas, y al guardar
 *   quedaban escritos también como etiquetas sueltas.
 *
 * Ahora las dos pantallas pasan por aquí. Cada una sigue decidiendo lo suyo
 * —qué campos ofrece, qué exige antes de guardar, a quién asigna—; lo que es
 * la ficha, se decide una sola vez.
 */

/** Los campos editables, como texto de formulario. */
export interface ValoresFicha {
  readonly nombre: string;
  readonly email: string;
  readonly pac: string;
  readonly ci: string;
  readonly empresa: string;
  /** `AAAA-MM-DD`, o vacío. */
  readonly fechaNacimiento: string;
  readonly lugarNacimiento: string;
  readonly notas: string;
  /** Separadas por coma, como se escriben en el campo. */
  readonly etiquetas: string;
}

/** Lo que se necesita de un cliente para abrir su ficha. Lo cumplen `Cliente` y el cliente del chat. */
export interface ClienteConFicha {
  readonly nombre: string;
  readonly email?: string | null;
  readonly pac?: string | null;
  readonly ci?: string | null;
  readonly empresaTrabajo?: string | null;
  readonly fechaNacimiento?: string | null;
  readonly ciLugar?: string | null;
  readonly datosExtra?: DatosExtra | null;
}

/**
 * Lo que se muestra al abrir la ficha.
 *
 * Las columnas mandan; el JSON solo cubre a las fichas que todavía no las
 * tienen (importadas de FileMaker, o editadas antes de que existieran).
 *
 * Las etiquetas son las guardadas en `datosExtra.tags`. Los intereses de la
 * paciente se siguen VIENDO como etiquetas (`etiquetasDe`), pero son otra
 * relación y no se editan desde este campo.
 */
export function valoresDeFicha(cliente: ClienteConFicha): ValoresFicha {
  const extra = cliente.datosExtra;
  const fecha = cliente.fechaNacimiento || textoExtra(extra, 'fechaNacimiento', 'fn');
  return {
    nombre: cliente.nombre,
    email: cliente.email || '',
    pac: cliente.pac || '',
    ci: cliente.ci || '',
    empresa: cliente.empresaTrabajo || textoExtra(extra, 'empresa'),
    fechaNacimiento: fechaDeFormulario(fecha),
    lugarNacimiento: cliente.ciLugar || textoExtra(extra, 'lugarNacimiento', 'CI.Lug.Pac'),
    notas: textoExtra(extra, 'notas'),
    etiquetas: listaExtra(extra, 'tags').join(', '),
  };
}

/**
 * La fecha como la piden `<input type="date">` y el backend (`@IsDateString`):
 * `AAAA-MM-DD`, o vacío.
 *
 * La columna siempre llega así, pero `fn` es texto de FileMaker y puede venir
 * suelto (ver `calcularEdad`). Antes se recortaba a 10 caracteres y se ponía
 * en el formulario tal cual: el campo de fecha lo mostraba vacío, pero la
 * señal lo guardaba, y al guardar CUALQUIER cambio de la ficha —una nota— se
 * mandaba ese texto y el backend rechazaba el PATCH entero. Lo que no es una
 * fecha de calendario no se precarga: `fn` sigue en el JSON (la edad se sigue
 * calculando con él) y guardar no lo toca.
 */
function fechaDeFormulario(valor: string | null | undefined): string {
  return /^\d{4}-\d{2}-\d{2}/.exec(valor ?? '')?.[0] ?? '';
}

/** Los cambios de ficha que entiende `PATCH /clientes/:id` (y, con `alta`, el `POST`). */
export type CambiosFicha = Pick<
  ActualizarClienteDto,
  'nombre' | 'email' | 'pac' | 'ci' | 'empresa' | 'fechaNacimiento' | 'lugarNacimiento' | 'datosExtra'
>;

/**
 * Lo que se manda al guardar.
 *
 * **Vacío significa borrar**, no «dejar como estaba»: un campo que la persona
 * deja en blanco se manda vacío o `null`, y el backend limpia la columna.
 *
 * En una edición, además, se anulan las copias viejas de empresa, lugar y
 * fecha que el chat escribía en `datosExtra`. Sin eso, al vaciar la columna
 * reaparecería el valor anterior desde el JSON. No hay pérdida: si el campo
 * mostraba ese valor, se acaba de guardar en su columna.
 *
 * En un alta la fecha vacía se omite: el `POST` convierte cualquier valor
 * presente en fecha, y `null` sería el 1 de enero de 1970.
 */
export function cambiosDeFicha(valores: ValoresFicha, { alta = false } = {}): CambiosFicha {
  const datosExtra: DatosExtra = {
    notas: valores.notas.trim() || null,
    tags: valores.etiquetas
      .split(',')
      .map(t => t.trim())
      .filter(Boolean),
  };
  if (!alta) {
    datosExtra['empresa'] = null;
    datosExtra['lugarNacimiento'] = null;
    datosExtra['fechaNacimiento'] = null;
  }
  return {
    nombre: valores.nombre.trim(),
    email: valores.email.trim() || null,
    pac: valores.pac.trim().toUpperCase() || null,
    ci: valores.ci.trim() || null,
    empresa: valores.empresa.trim(),
    fechaNacimiento: valores.fechaNacimiento || (alta ? undefined : null),
    lugarNacimiento: valores.lugarNacimiento.trim(),
    datosExtra,
  };
}
