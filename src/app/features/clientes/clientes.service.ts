import { inject, Injectable } from '@angular/core';

import { ApiService, ResourceRequest } from '../../core/api/api.service';
import { CategoriaCliente } from '../../shared/models/cliente-categoria.model';
import { Cliente, HistorialPaciente } from './cliente.model';

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
  categoria?: CategoriaCliente;
  datosExtra?: {
    empresa?: string | null;
    edad?: string | number | null;
    lugarNacimiento?: string | null;
    notas?: string | null;
    tags?: string[];
    [key: string]: any;
  };
}

export interface CrearClienteDto {
  nombre: string;
  telefono: string;
  email?: string | null;
  categoria?: CategoriaCliente;
  agenteId?: string;
  datosExtra?: Record<string, any>;
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

  crear(dto: CrearClienteDto): Promise<Cliente> {
    return this.api.post<Cliente>('/clientes', dto);
  }

  actualizar(id: string, cambios: ActualizarClienteDto): Promise<Cliente> {
    return this.api.patch<Cliente>(`/clientes/${id}`, cambios);
  }

  /**
   * Ficha completa de un cliente. Se pide al abrir el detalle y no viene en el
   * listado a propósito: la ficha del paciente son diez campos más que solo se
   * miran de uno en uno, y arrastrarlos en cada página de 25 encarece la lista
   * sin que nadie los lea.
   */
  obtener(id: string): Promise<Cliente> {
    return this.api.get<Cliente>(`/clientes/${id}`);
  }

  /** Servicios que se le realizaron al paciente, cruzados por su PAC. */
  historial(id: string): Promise<HistorialPaciente> {
    return this.api.get<HistorialPaciente>(`/clientes/${id}/historial`);
  }
}
