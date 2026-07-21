import { inject, Injectable } from '@angular/core';

import { ApiService, ResourceRequest } from '../../core/api/api.service';
import { EstadoComision } from '../../shared/models/estados.model';
import { Comision } from './comision.model';

/**
 * Comisiones — liquidación por agente (RF-14/RF-15).
 * Marcar como pagada es exclusivo de ADMIN: el backend lo bloquea con @Roles.
 */
@Injectable({ providedIn: 'root' })
export class ComisionesService {
  private readonly api = inject(ApiService);

  listarRequest(estado?: EstadoComision, pagina?: number, limite?: number): ResourceRequest {
    return this.api.request('/comisiones', { estado, pagina, limite });
  }

  marcarPagada(id: string): Promise<Comision> {
    return this.api.post<Comision>(`/comisiones/${id}/pagar`);
  }
}
