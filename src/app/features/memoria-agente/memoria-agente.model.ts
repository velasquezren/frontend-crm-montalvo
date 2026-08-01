import { CategoriaRecursoMemoria, TipoRecursoMemoria } from '../../core/api/db-enums';

export type { CategoriaRecursoMemoria, TipoRecursoMemoria };

export interface RecursoMemoria {
  readonly id: string;
  readonly usuarioId: string;
  readonly titulo: string;
  readonly contenido: string | null;
  readonly tipo: TipoRecursoMemoria;
  readonly categoria: CategoriaRecursoMemoria;
  readonly atajo: string | null;
  readonly mediaKey: string | null;
  readonly mediaUrl: string | null;
  readonly mediaMime: string | null;
  readonly mediaNombre: string | null;
  readonly pesoBytes: number;
  readonly tags: readonly string[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CuotaMemoria {
  readonly bytesUsados: number;
  readonly megabytesUsados: number;
  readonly megabytesMaximos: number;
  readonly porcentajeUsado: number;
  readonly recursosCount: number;
}
