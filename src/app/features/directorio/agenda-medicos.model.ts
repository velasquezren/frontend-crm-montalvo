import { FichaMedico } from './directorio.model';

/**
 * Los médicos de la AGENDA de la clínica (ScriptCase), tal como los devuelve
 * `/agenda/medicos` del backend. Es la lista que da los cupos, que FileMaker lee
 * y que la landing publica: el Directorio la edita directamente.
 */

export type EstadoMedicoAgenda = 'ACTIVO' | 'INACTIVO';

/** Días de la agenda, escritos como en ScriptCase (sin tildes, sin domingo). */
export type DiaAgenda = 'Lunes' | 'Martes' | 'Miercoles' | 'Jueves' | 'Viernes' | 'Sabado';

const NOMBRE_DIA: Readonly<Record<DiaAgenda, string>> = {
  Lunes: 'Lunes', Martes: 'Martes', Miercoles: 'Miércoles', Jueves: 'Jueves', Viernes: 'Viernes', Sabado: 'Sábado',
};
const DIA_CORTO: Readonly<Record<DiaAgenda, string>> = {
  Lunes: 'Lun', Martes: 'Mar', Miercoles: 'Mié', Jueves: 'Jue', Viernes: 'Vie', Sabado: 'Sáb',
};

export const nombreDiaAgenda = (dia: DiaAgenda): string => NOMBRE_DIA[dia];
export const diaCortoAgenda = (dia: DiaAgenda): string => DIA_CORTO[dia];

export interface MedicoAgenda {
  id: number;
  /** Código de FileMaker. Solo lectura: se escribe al dar de alta y nunca más. */
  codigo: string | null;
  nombre: string;
  sigla: string | null;
  especialidad: string | null;
  telefono: string | null;
  estado: string;
  /** Como lo guarda la agenda («400.00»), o null. */
  precio: string | null;
  bancoId: number | null;
  orden: number;
  /** Con horario cargado la web lo reserva en línea; sin él, «a solicitud». */
  reservaEnLinea: boolean;
  casillasActivas: number;
  fotoVersion: string | null;
}

/** De dónde sale la foto que el CRM muestra de un médico. */
export type OrigenFotoMedico = 'WEB' | 'AGENDA';

/**
 * La foto de un médico como la ve la clínica: la de su ficha web y, si no
 * tiene, la de la agenda (ScriptCase), que es la que ya publica la landing.
 * La de la agenda solo llega de médicos activos. Se muestra con `urlDeLaApi`.
 */
export interface FotoDeMedico {
  fotoUrl: string | null;
  fotoOrigen: OrigenFotoMedico | null;
}

/**
 * Un médico de la agenda nombrado por su código de FileMaker (el `medicoPk`
 * del historial de servicios): su cara y el id de su ficha del Directorio.
 */
export interface MedicoPorCodigo extends FotoDeMedico {
  codigo: string;
  id: number;
  nombre: string;
  especialidad: string | null;
  activo: boolean;
}

/** Su ficha web en el listado: foto (URL firmada: se muestra, no se guarda) y si está publicada. */
export interface WebDeMedico {
  perfilId: string;
  publicado: boolean;
  fotoUrl: string | null;
}

/** Una fila del listado: el médico de la agenda y su ficha web, si tiene. */
export interface MedicoAgendaConWeb extends MedicoAgenda, FotoDeMedico {
  web: WebDeMedico | null;
}

/**
 * Los días con al menos una hora libre en los próximos 30 (`/publico/agenda/dias`).
 * Espejo de `DiasAgenda` en `agenda.contrato.ts` del backend: la misma lectura
 * que ofrecen la web, el Flow y el asistente.
 */
export interface DiasLibresAgenda {
  medicoId: string;
  zonaHoraria: 'America/La_Paz';
  /** Fechas civiles («2026-10-23»), en orden. Sin los días de vacaciones del médico. */
  fechas: string[];
  /** Vacaciones o congreso que tocan estos 30 días, con el día en que vuelve. Solo si hay. */
  ausencias?: { desde: string; hasta: string; motivo: string | null; vuelve: string }[];
}

/** Las horas libres de un médico en una fecha (`/publico/agenda/disponibilidad`). */
export interface HorasLibresAgenda {
  medicoId: string;
  fecha: string;
  zonaHoraria: 'America/La_Paz';
  consultadoEn: string;
  estado: 'DISPONIBLE' | 'SIN_CUPOS' | 'SIN_ATENCION' | 'A_SOLICITUD';
  /** En orden; vacío salvo con `DISPONIBLE`. */
  horarios: { id: string; hora: string }[];
}

export interface CasillaAgenda {
  id: number;
  dia: string;
  hora: string;
  activa: boolean;
}

export interface FichaMedicoAgenda extends FotoDeMedico {
  medico: MedicoAgenda;
  casillas: CasillaAgenda[];
  grilla: { dias: DiaAgenda[]; horas: string[]; minutosConsulta?: number };
  /** Se devuelve al guardar: si otra persona guardó antes, el backend responde 409. */
  version: string;
  /** La ficha web (foto, biografía, publicación), o null si todavía no tiene. */
  presentacion: FichaMedico | null;
  /** Opcional durante el despliegue gradual del backend. */
  sincronizacionHorario?: { origen: 'CRM' | 'FILEMAKER'; pendiente: boolean; sincronizadoEn: string | null };
  /** Vacaciones y ausencias que todavía no terminaron. Opcional hasta que el backend las mande. */
  ausencias?: AusenciaAgenda[];
}

/**
 * Vacaciones o congreso de un médico de la agenda (días de La Paz, los dos
 * extremos incluidos). Esos días la web, el Flow, el asistente y «Cupos» no los
 * ofrecen y la reserva se rechaza; las citas que ya estaban no se tocan.
 */
export interface AusenciaAgenda {
  readonly id: string;
  readonly desde: string;
  readonly hasta: string;
  readonly motivo: string | null;
  /** Citas vigentes y reservas sin cargar que ya tiene esos días; `null` si la agenda no respondió. */
  readonly pendientes: { readonly citas: number; readonly reservas: number } | null;
}

/** «3 citas y 1 reserva», o null si no hay nada que reprogramar. */
export function textoPendientes(p: { readonly citas: number; readonly reservas: number }): string | null {
  const partes = [
    p.citas ? `${p.citas} ${p.citas === 1 ? 'cita' : 'citas'}` : '',
    p.reservas ? `${p.reservas} ${p.reservas === 1 ? 'reserva' : 'reservas'}` : '',
  ].filter(Boolean);
  return partes.length ? partes.join(' y ') : null;
}

/** Lo que falta para que una ficha web se vea bien publicada. Solo la especialidad es obligatoria. */
export interface RequisitoWeb {
  readonly id: 'especialidad' | 'foto' | 'resumen' | 'horario';
  readonly etiqueta: string;
  readonly cumple: boolean;
  readonly obligatorio: boolean;
}

export function requisitosWeb(f: FichaMedicoAgenda): RequisitoWeb[] {
  const p = f.presentacion;
  return [
    { id: 'especialidad', etiqueta: 'Al menos una especialidad', cumple: !!p && p.especialidades.length > 0, obligatorio: true },
    { id: 'foto', etiqueta: 'Foto de buena calidad', cumple: !!p?.fotoUrl, obligatorio: false },
    { id: 'resumen', etiqueta: 'Resumen de una línea', cumple: !!p?.resumen.trim(), obligatorio: false },
    { id: 'horario', etiqueta: 'Horario cargado en la agenda', cumple: f.medico.casillasActivas > 0, obligatorio: false },
  ];
}

export interface EspecialidadAgenda {
  nombre: string;
  medicos: number;
  activos: number;
  /** Su entrada en la landing, o null si no se muestra en la web. */
  pagina: PaginaEspecialidad | null;
}

/** Una especialidad en la landing: sección en «Especialidades» y grupo en «Staff médico» (`#<slug>`). */
export interface PaginaEspecialidad {
  id: string;
  nombre: string;
  slug: string;
  descripcion: string;
  /** Inactiva: no se muestra ni se ofrece en la web. */
  activa: boolean;
  orden: number;
  /** Médicos con ficha web publicada en ella. */
  publicados: number;
}

export interface BancoAgenda {
  id: number;
  nombre: string;
  /** AAAA-MM-DD, o null. */
  vence: string | null;
}

/** Lo que se edita de un médico (el código, no). */
export interface DatosMedicoAgenda {
  nombre: string;
  sigla: string | null;
  especialidad: string;
  telefono: string | null;
  estado: EstadoMedicoAgenda;
  precio: string | null;
  bancoId: number | null;
  orden: number;
}

/** El formulario de datos, con todo como texto (así llega de los campos). */
export interface FormularioMedicoAgenda {
  nombre: string;
  sigla: string;
  especialidad: string;
  telefono: string;
  estado: EstadoMedicoAgenda;
  precio: string;
  bancoId: string;
  orden: string;
}

export function formularioDe(m: MedicoAgenda | null): FormularioMedicoAgenda {
  return {
    nombre: m?.nombre ?? '',
    sigla: m?.sigla ?? '',
    especialidad: m?.especialidad ?? '',
    telefono: m?.telefono ?? '',
    estado: m?.estado === 'INACTIVO' ? 'INACTIVO' : 'ACTIVO',
    precio: m?.precio ?? '',
    bancoId: m?.bancoId === null || m?.bancoId === undefined ? '' : String(m.bancoId),
    orden: String(m?.orden ?? 0),
  };
}

/**
 * Los datos listos para el backend, o el primer problema que tienen. Los
 * límites son los de las columnas de la agenda (`sigla` admite 5 letras).
 */
export function datosDeFormulario(f: FormularioMedicoAgenda): { datos: DatosMedicoAgenda } | { error: string } {
  const nombre = f.nombre.trim();
  const especialidad = f.especialidad.trim();
  const precio = f.precio.trim().replace(',', '.');
  const orden = f.orden.trim() === '' ? 0 : Number(f.orden);
  if (!nombre) return { error: 'Escribe el nombre del médico.' };
  if (!especialidad) return { error: 'Elige o escribe la especialidad.' };
  if (f.sigla.trim().length > 5) return { error: 'El título va abreviado, hasta 5 letras (Dr., Dra., Lic.).' };
  if (precio && !/^\d{1,8}(\.\d{1,2})?$/.test(precio)) return { error: 'Escribe el precio solo con números, por ejemplo 250 o 250.50.' };
  if (!Number.isInteger(orden) || orden < 0 || orden > 9999) return { error: 'El orden es un número entero desde 0.' };
  return {
    datos: {
      nombre,
      sigla: f.sigla.trim() || null,
      especialidad,
      telefono: f.telefono.trim() || null,
      estado: f.estado,
      precio: precio || null,
      bancoId: f.bancoId ? Number(f.bancoId) : null,
      orden,
    },
  };
}

/** «Dra. Ana Pérez». */
export function nombreConTitulo(m: Pick<MedicoAgenda, 'sigla' | 'nombre'>): string {
  return [m.sigla, m.nombre].filter(Boolean).join(' ');
}

/** Clave de una casilla de la grilla. */
export const claveCasilla = (dia: string, hora: string): string => `${dia} ${hora}`;

/** Las casillas encendidas de una ficha, como conjunto de claves. */
export function casillasEncendidas(f: FichaMedicoAgenda): Set<string> {
  return new Set(f.casillas.filter(c => c.activa).map(c => claveCasilla(c.dia, c.hora)));
}

/** «Lun 9:00–11:30 · Mié 15:00–18:30»: el resumen de las casillas encendidas (la última es su hora de inicio). */
export function resumenDeCasillas(dias: readonly DiaAgenda[], horas: readonly string[], encendidas: ReadonlySet<string>): string {
  const sinCero = (h: string) => h.replace(/^0(\d)/, '$1');
  return dias
    .map(dia => {
      const del = horas.filter(h => encendidas.has(claveCasilla(dia, h)));
      if (del.length === 0) return null;
      const primera = sinCero(del[0]);
      const ultima = sinCero(del[del.length - 1]);
      return `${diaCortoAgenda(dia)} ${primera === ultima ? primera : `${primera}–${ultima}`}`;
    })
    .filter((x): x is string => x !== null)
    .join(' · ');
}

/**
 * El número de WhatsApp con el que un médico consulta su agenda por el asistente
 * (`GET /agenda/medicos/:id/whatsapp`). Solo lo ve administración; `acceso` es
 * `null` mientras ningún número esté autorizado.
 */
export interface AccesoWhatsappMedico {
  readonly agendaMedicoId: number;
  /** E.164. */
  readonly telefono: string;
  readonly nombreMedico: string;
  readonly autorizadoPor: string | null;
  readonly autorizadoEn: string;
}

export interface RespuestaAccesoWhatsapp {
  readonly acceso: AccesoWhatsappMedico | null;
}
