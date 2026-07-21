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

/**
 * Leads — captación multi-canal (RF-04/RF-06) y pipeline kanban.
 */
@Injectable({ providedIn: 'root' })
export class LeadsService {
  private readonly api = inject(ApiService);

  listarRequest(origen?: OrigenLeadApi, pagina?: number, limite?: number): ResourceRequest {
    return this.api.request('/leads', { origen, pagina, limite });
  }

  /** Mueve una tarjeta del kanban a otra columna. */
  cambiarEstado(id: string, estado: EstadoLead): Promise<Lead> {
    return this.api.patch<Lead>(`/leads/${id}/estado`, { estado });
  }

  crearPresencial(datos: CrearLeadPresencialDto): Promise<Lead> {
    return this.api.post<Lead>('/leads/presencial', datos);
  }
}
