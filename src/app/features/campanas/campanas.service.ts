import { inject, Injectable } from '@angular/core';

import { ApiService, ResourceRequest } from '../../core/api/api.service';
import { Campana, EstadoDestinatario, NuevaCampana } from './campana.model';

/** Campañas. Lanzar y controlar es de SUPER_ADMIN; el backend lo exige. */
@Injectable({ providedIn: 'root' })
export class CampanasService {
  private readonly api = inject(ApiService);

  listarRequest(pagina: number): ResourceRequest {
    return this.api.request('/campanas', { pagina });
  }

  detalleRequest(id: string): ResourceRequest {
    return this.api.request(`/campanas/${id}`);
  }

  destinatariosRequest(id: string, pagina: number, estado: EstadoDestinatario | null): ResourceRequest {
    return this.api.request(`/campanas/${id}/destinatarios`, { pagina, estado });
  }

  crear(campana: NuevaCampana): Promise<Campana> {
    return this.api.post<Campana>('/campanas', campana);
  }

  pausar(id: string): Promise<Campana> {
    return this.api.post<Campana>(`/campanas/${id}/pausar`);
  }

  reanudar(id: string): Promise<Campana> {
    return this.api.post<Campana>(`/campanas/${id}/reanudar`);
  }

  cancelar(id: string): Promise<Campana> {
    return this.api.post<Campana>(`/campanas/${id}/cancelar`);
  }
}
