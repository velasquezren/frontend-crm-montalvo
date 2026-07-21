import { inject, Injectable } from '@angular/core';

import { ApiService, ResourceRequest } from '../../core/api/api.service';
import { Agente, CreateAgentePayload } from './agente.model';

/**
 * Agentes (usuarios) — gestión del equipo de ventas.
 * Todo el módulo es exclusivo de ADMIN: el backend lo bloquea con @Roles,
 * y el frontend además oculta la ruta con `adminGuard`.
 */
@Injectable({ providedIn: 'root' })
export class AgentesService {
  private readonly api = inject(ApiService);

  listarRequest(): ResourceRequest {
    return this.api.request('/usuarios');
  }

  crear(datos: CreateAgentePayload): Promise<Agente> {
    return this.api.post<Agente>('/usuarios', datos);
  }

  /** Alta/baja lógica — nunca se borra un usuario (conserva trazabilidad, RNF-05). */
  cambiarActivo(id: string, activo: boolean): Promise<Agente> {
    return this.api.patch<Agente>(`/usuarios/${id}`, { activo });
  }
}
