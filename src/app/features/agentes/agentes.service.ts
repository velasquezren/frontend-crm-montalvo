import { inject, Injectable } from '@angular/core';

import { ApiService, ResourceRequest } from '../../core/api/api.service';
import { Agente, CreateAgentePayload } from './agente.model';

/** Campos editables de un agente. La contraseña solo viaja si se cambia. */
export interface ActualizarAgenteDto {
  nombre?: string;
  email?: string;
  rol?: 'ADMIN' | 'AGENTE';
  activo?: boolean;
  password?: string;
}

/**
 * Agentes (usuarios) — gestión del equipo de ventas.
 * Todo el módulo es exclusivo de ADMIN: el backend lo bloquea con @Roles,
 * y el frontend además oculta la ruta con `adminGuard`.
 *
 * El backend impide que un admin se desactive o degrade a sí mismo, y que
 * el sistema quede sin ningún administrador activo.
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

  actualizar(id: string, cambios: ActualizarAgenteDto): Promise<Agente> {
    return this.api.patch<Agente>(`/usuarios/${id}`, cambios);
  }

  /** Alta/baja lógica — nunca se borra un usuario (conserva trazabilidad, RNF-05). */
  cambiarActivo(id: string, activo: boolean): Promise<Agente> {
    return this.api.patch<Agente>(`/usuarios/${id}`, { activo });
  }

  /**
   * Desactiva la cuenta (DELETE en el API es baja lógica, no borrado físico:
   * las ventas y comisiones del agente deben seguir existiendo).
   */
  desactivar(id: string): Promise<Agente> {
    return this.api.delete<Agente>(`/usuarios/${id}`);
  }
}
