/**
 * Directorio médico: espejo de `modules/directorio` del backend. Especialidades,
 * la ficha pública de cada médico y su horario semanal INFORMATIVO (las citas
 * reales siguen en la agenda de la clínica). Diseño:
 * backend-crm-montalvo/docs/promociones-y-directorio.md.
 */

export interface Especialidad {
  readonly id: string;
  readonly nombre: string;
  readonly slug: string;
  readonly descripcion: string;
  readonly activa: boolean;
  readonly orden: number;
  /** Fichas que la tienen (publicadas o no). */
  readonly medicos: number;
}

export interface EspecialidadCorta {
  readonly id: string;
  readonly nombre: string;
  readonly slug: string;
}

export interface BloqueHorario {
  readonly diaSemana: number;
  /** «08:00» */
  readonly desde: string;
  readonly hasta: string;
  readonly lugar: string | null;
}

export interface FichaResumen {
  readonly id: string;
  readonly nombrePublico: string;
  readonly slug: string;
  readonly publicado: boolean;
  readonly codigoFilemaker: string | null;
  readonly especialidades: readonly EspecialidadCorta[];
  readonly resumenHorario: string;
  /** Firmada: se muestra, nunca se guarda. */
  readonly fotoUrl: string | null;
  readonly precioConsulta: number | null;
  readonly version: number;
}

export interface Ausencia {
  readonly id: string;
  readonly desde: string;
  readonly hasta: string;
  readonly motivoPublico: string | null;
}

export interface FichaMedico {
  readonly id: string;
  readonly nombrePublico: string;
  readonly slug: string;
  readonly resumen: string;
  readonly biografia: string;
  readonly matricula: string | null;
  readonly precioConsulta: number | null;
  readonly publicado: boolean;
  readonly orden: number;
  readonly version: number;
  /** El médico de la agenda que esta ficha presenta en la web; su precio y horario salen de allí. */
  readonly agendaMedicoId?: number | null;
  readonly medico: { readonly id: string; readonly codigo: string; readonly nombre: string } | null;
  readonly especialidades: readonly EspecialidadCorta[];
  readonly horario: readonly BloqueHorario[];
  readonly resumenHorario: string;
  readonly ausencias: readonly Ausencia[];
  readonly fotoUrl: string | null;
}

export interface MedicoSinFicha {
  readonly id: string;
  readonly codigo: string;
  readonly nombre: string;
  readonly especialidad: string | null;
}

/** ISO: 1 = lunes … 7 = domingo, como el backend. */
export const DIAS: readonly { readonly valor: number; readonly nombre: string; readonly corto: string }[] = [
  { valor: 1, nombre: 'Lunes', corto: 'Lun' },
  { valor: 2, nombre: 'Martes', corto: 'Mar' },
  { valor: 3, nombre: 'Miércoles', corto: 'Mié' },
  { valor: 4, nombre: 'Jueves', corto: 'Jue' },
  { valor: 5, nombre: 'Viernes', corto: 'Vie' },
  { valor: 6, nombre: 'Sábado', corto: 'Sáb' },
  { valor: 7, nombre: 'Domingo', corto: 'Dom' },
];

export function nombreDia(dia: number): string {
  return DIAS.find(d => d.valor === dia)?.nombre ?? `Día ${dia}`;
}

/** Un bloque que se está editando: todo texto, como se teclea. */
export interface BloqueEditable {
  diaSemana: number;
  desde: string;
  hasta: string;
  lugar: string;
}

const HORA = /^([01]\d|2[0-4]):[0-5]\d$/;

/**
 * Lo que impide guardar el horario, dicho antes de mandarlo. El backend vuelve
 * a validarlo (`erroresDelHorario`): esto solo ahorra un viaje.
 */
export function problemasDelHorario(bloques: readonly BloqueEditable[]): string[] {
  const problemas: string[] = [];
  const minutos = (h: string) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3));
  for (const b of bloques) {
    if (!HORA.test(b.desde) || !HORA.test(b.hasta)) {
      problemas.push(`${nombreDia(b.diaSemana)}: escribe las horas como 08:00.`);
    } else if (minutos(b.desde) >= minutos(b.hasta)) {
      problemas.push(`${nombreDia(b.diaSemana)}: la hora de fin tiene que ser posterior a la de inicio.`);
    }
  }
  for (const dia of DIAS) {
    const delDia = bloques.filter(b => b.diaSemana === dia.valor && HORA.test(b.desde) && HORA.test(b.hasta)).sort((a, b) => a.desde.localeCompare(b.desde));
    for (let i = 1; i < delDia.length; i++) {
      if (delDia[i].desde < delDia[i - 1].hasta) problemas.push(`${dia.nombre}: hay bloques que se superponen.`);
    }
  }
  return problemas;
}

/** El horario guardado, en el orden en que se lee: por día y por hora. */
export function bloquesEditables(horario: readonly BloqueHorario[]): BloqueEditable[] {
  return [...horario]
    .sort((a, b) => a.diaSemana - b.diaSemana || a.desde.localeCompare(b.desde))
    .map(b => ({ diaSemana: b.diaSemana, desde: b.desde, hasta: b.hasta, lugar: b.lugar ?? '' }));
}
