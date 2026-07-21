import { inject, Injectable } from '@angular/core';

import { ApiService, ResourceRequest } from '../../core/api/api.service';
import { EstadoLead } from '../../shared/models/estados.model';
import { Lead, OrigenLeadApi } from './lead.model';

/** Alta rápida en ventanilla — el agente y la fecha los pone el backend (RF-07/RF-08). */
export interface CrearLeadPresencialDto {
  nombre: string;
  telefono: string;
  interes?: string;
}

export interface FiltroLeads {
  origen?: OrigenLeadApi;
  estado?: EstadoLead;
  /** Incluir el histórico importado de FileMaker (excluido por defecto). */
  incluirImportacion?: boolean;
  pagina?: number;
  limite?: number;
}

/** Conteos reales por columna del kanban (GET /leads/resumen). */
export interface ResumenLeads {
  porEstado: Record<EstadoLead, number>;
  totalPipeline: number;
  historicoImportado: number;
}

/**
 * Leads — captación multi-canal (RF-04/RF-06) y pipeline kanban.
 *
 * El histórico importado (15.000+ pacientes de FileMaker) queda fuera del
 * pipeline por defecto: no son prospectos que un agente deba trabajar. Se
 * consulta explícitamente con `incluirImportacion`.
 */
@Injectable({ providedIn: 'root' })
export class LeadsService {
  private readonly api = inject(ApiService);

  listarRequest(filtro: FiltroLeads = {}): ResourceRequest {
    return this.api.request('/leads', {
      origen: filtro.origen,
      estado: filtro.estado,
      incluirImportacion: filtro.incluirImportacion ? 'true' : undefined,
      pagina: filtro.pagina,
      limite: filtro.limite,
    });
  }

  resumenRequest(filtro: FiltroLeads = {}): ResourceRequest {
    return this.api.request('/leads/resumen', {
      origen: filtro.origen,
      incluirImportacion: filtro.incluirImportacion ? 'true' : undefined,
    });
  }

  /** Mueve una tarjeta del kanban a otra columna. */
  cambiarEstado(id: string, estado: EstadoLead): Promise<Lead> {
    return this.api.patch<Lead>(`/leads/${id}/estado`, { estado });
  }

  crearPresencial(datos: CrearLeadPresencialDto): Promise<Lead> {
    return this.api.post<Lead>('/leads/presencial', datos);
  }
}
