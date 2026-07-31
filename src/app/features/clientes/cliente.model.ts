/** Ficha clínica del paciente — espejo de `DatosPaciente` del backend. */
export interface DatosPaciente {
  readonly pac: string | null;
  readonly edad: number | null;
  readonly ocupacion: string | null;
  readonly ci: string | null;
  readonly lugarCi: string | null;
  readonly sexo: string | null;
  readonly estadoCivil: string | null;
  readonly direccion: string | null;
  readonly nacionalidad: string | null;
  readonly telefonoFijo: string | null;
}

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
  /**
   * Ficha del paciente ya traducida por el backend. Antes aquí llegaba el
   * volcado crudo de FileMaker con sus nombres (`Edad.a`, `CI.Lug.Pac`), que
   * además no coincidían con las claves que esperaba esta interfaz — por eso
   * los datos nunca aparecían en pantalla.
   */
  readonly paciente?: DatosPaciente | null;
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
