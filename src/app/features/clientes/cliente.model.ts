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
  readonly datosExtra?: {
    empresa?: string;
    edad?: number | string;
    lugarNacimiento?: string;
    notas?: string;
    tags?: string[];
    [key: string]: any;
  } | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}
