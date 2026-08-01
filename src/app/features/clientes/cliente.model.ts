import { CategoriaCliente } from '../../shared/models/cliente-categoria.model';

/** Respuesta de GET /clientes del backend (schema.prisma es la fuente de verdad). */
export interface InteresApi {
  readonly id: string;
  readonly descripcion: string;
  readonly categoriaProducto: string | null;
  readonly origen: string;
  readonly createdAt: string;
}

export interface Cliente {
  readonly id: string;
  readonly nombre: string;
  readonly telefono: string;
  readonly email: string | null;
  readonly categoria: CategoriaCliente;
  readonly agenteId: string | null;
  readonly agente: { id: string; nombre: string } | null;
  readonly intereses: readonly InteresApi[];
  /* ── Ficha del paciente ──────────────────────────────────────────────
     Campos propios del cliente, no un objeto aparte: el paciente y el
     contacto son la misma entidad. Vienen en el listado, así que la ficha
     abre sin pedir nada al servidor. */
  readonly pac?: string | null;
  /** Fuente de verdad de la edad; se calcula al mostrarla y nunca caduca. */
  readonly fechaNacimiento?: string | null;
  readonly sexo?: string | null;
  readonly ocupacion?: string | null;
  readonly ci?: string | null;
  readonly ciLugar?: string | null;
  readonly estadoCivil?: string | null;
  readonly direccion?: string | null;
  readonly nacionalidad?: string | null;
  readonly telefonoFijo?: string | null;
  readonly nit?: string | null;
  readonly saldoTotal?: string | null;
  readonly datosExtra?: {
    empresa?: string;
    edad?: number | string;
    lugarNacimiento?: string;
    notas?: string;
    tags?: string[];
  } | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** Un servicio realizado al paciente, tomado de las planillas importadas. */
export interface ServicioPaciente {
  readonly id: string;
  readonly fecha: string | null;
  readonly modulo: string | null;
  readonly detalle: string;
  readonly clasif: string;
  readonly precio: string;
  readonly medico: string | null;
  readonly vendedoraNombre: string | null;
  readonly periodo: { readonly anio: number; readonly mes: number };
}

export interface HistorialPaciente {
  readonly pac: string | null;
  readonly totalServicios: number;
  readonly montoTotal: number;
  readonly servicios: readonly ServicioPaciente[];
}
