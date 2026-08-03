import { CategoriaCliente, ClasifComision } from '../../core/api/db-enums';

/** Un conteo con su etiqueta, la forma que consumen los gráficos. */
export interface Conteo {
  etiqueta: string;
  total: number;
}

export interface ConteoConIngreso extends Conteo {
  ingreso: number;
}

export interface MedicoResumen extends ConteoConIngreso {
  codigo: string;
}

/**
 * Cuántos servicios llegan a enlazar con la ficha del paciente.
 *
 * Se expone en vez de esconderse: el maestro de pacientes está importado a
 * medias, así que hoy la mayoría de los servicios no encuentra su ficha. Verlo
 * en pantalla es la única forma de que alguien complete el volcado.
 */
export interface CoberturaFicha {
  servicios: number;
  conCodigo: number;
  conFicha: number;
}

export interface DashboardServicios {
  totales: { servicios: number; pacientes: number; medicos: number; ingreso: number };
  cobertura: CoberturaFicha;
  porModulo: ConteoConIngreso[];
  porClasif: Conteo[];
  topServicios: ConteoConIngreso[];
  porMedico: MedicoResumen[];
  porMes: { anio: number; mes: number; total: number; ingreso: number }[];
}

export interface Demografia {
  total: number;
  visitasPromedio: number;
  saldoAcumulado: number;
  porSexo: Conteo[];
  porDepartamento: Conteo[];
  porTramoEdad: Conteo[];
}

export interface PacienteConServicios {
  pac: string | null;
  paciente: string | null;
  servicios: number;
  gastado: number;
  ultimaVisita: string | null;
  /** null = todavía no tiene ficha en el CRM; el historial se muestra igual. */
  clienteId: string | null;
}

export interface FichaPaciente {
  id: string;
  nombre: string;
  telefono: string;
  email: string | null;
  pac: string | null;
  fechaNacimiento: string | null;
  edad: number | null;
  sexo: string | null;
  ocupacion: string | null;
  ciLugar: string | null;
  estadoCivil: string | null;
  direccion: string | null;
  nacionalidad: string | null;
  empresaTrabajo: string | null;
  visitasPrevias: number | null;
  saldoTotal: number;
  categoria: CategoriaCliente;
  agente: { id: string; nombre: string } | null;
}

export interface ServicioDelHistorial {
  id: string;
  fecha: string | null;
  modulo: string | null;
  detalle: string;
  precio: number;
  medico: string | null;
  medicoPk: string | null;
  seguro: string | null;
  clasif: ClasifComision;
  vendedoraNombre: string | null;
  periodo: { anio: number; mes: number } | null;
}

export interface HistorialPaciente {
  pac: string;
  nombre: string;
  /** null = el paciente existe en los servicios pero aún no en el CRM. */
  ficha: FichaPaciente | null;
  resumen: {
    servicios: number;
    gastado: number;
    primeraVisita: string | null;
    ultimaVisita: string | null;
    medicos: number;
  };
  servicios: ServicioDelHistorial[];
}

export interface MedicoConServicios {
  codigo: string | null;
  nombre: string | null;
  servicios: number;
  pacientes: number;
  ingreso: number;
  ultimaAtencion: string | null;
}
