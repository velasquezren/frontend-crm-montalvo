import { inject, Injectable } from '@angular/core';

import { ApiService, ResourceRequest } from '../../core/api/api.service';
import { CategoriaCliente } from '../../shared/models/cliente-categoria.model';
import { Cliente } from './cliente.model';

export interface FiltroClientes {
  busqueda?: string;
  categoria?: CategoriaCliente;
  pagina?: number;
  limite?: number;
}

/**
 * Campos editables de la ficha de cliente (RF-01).
 * `datosExtra` es el JSON libre del schema: guarda lo que no tiene columna propia
 * (empresa, notas, tags y los campos heredados del import de FileMaker).
 */
export interface ActualizarClienteDto {
  nombre?: string;
  telefono?: string;
  email?: string | null;
  datosExtra?: {
    empresa?: string | null;
    notas?: string | null;
    tags?: string[];
  };
}

/**
 * Clientes — dominio dueño del expediente del cliente (RF-01/RF-03/RF-24).
 * La visibilidad por rol la resuelve el backend; aquí no se filtra por agente.
 */
@Injectable({ providedIn: 'root' })
export class ClientesService {
  private readonly api = inject(ApiService);

  /** Petición para `httpResource()` — la reactividad vive en la página. */
  listarRequest(filtro: FiltroClientes): ResourceRequest {
    return this.api.request('/clientes', {
      busqueda: filtro.busqueda,
      categoria: filtro.categoria,
      pagina: filtro.pagina,
      limite: filtro.limite,
    });
  }

  buscarRequest(termino: string): ResourceRequest {
    return this.api.request('/clientes', { busqueda: termino });
  }

  actualizar(id: string, cambios: ActualizarClienteDto): Promise<Cliente> {
    return this.api.patch<Cliente>(`/clientes/${id}`, cambios);
  }
}
