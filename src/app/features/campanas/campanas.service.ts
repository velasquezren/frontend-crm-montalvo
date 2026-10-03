import { inject, Injectable } from '@angular/core';

import { ApiService, ResourceRequest } from '../../core/api/api.service';
import { FiltroAudiencia } from './audiencia.model';
import { Campana, EstadoDestinatario, NuevaCampana } from './campana.model';

/**
 * Campañas, de punta a punta: la audiencia (a quién), la campaña (qué se le
 * manda) y su seguimiento. Ver la audiencia es de administración; lanzar y
 * controlar, de SUPER_ADMIN. El backend lo exige.
 */
@Injectable({ providedIn: 'root' })
export class CampanasService {
  private readonly api = inject(ApiService);

  /** Quiénes recibirían una campaña hoy, con el embudo. Solo lee. */
  audienciaRequest(filtro: FiltroAudiencia): ResourceRequest {
    return this.api.request('/campanas/audiencia', {
      categorias: filtro.categorias.join(','),
      diasSinCampana: filtro.diasSinCampana,
      soloConversaron: filtro.soloConversaron ? 'true' : undefined,
      pagina: filtro.pagina,
    });
  }

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
