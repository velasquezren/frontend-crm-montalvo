import { inject, Injectable } from '@angular/core';
import { ApiService, ResourceRequest } from '../../core/api/api.service';
import { CuotaMemoria, RecursoMemoria } from './memoria-agente.model';

@Injectable({ providedIn: 'root' })
export class MemoriaAgenteService {
  private readonly api = inject(ApiService);

  cuotaRequest(): ResourceRequest {
    return this.api.request('/memoria-agente/cuota');
  }

  listarRequest(params?: { tipo?: string; categoria?: string; busqueda?: string }): ResourceRequest {
    const query = new URLSearchParams();
    if (params?.tipo) query.set('tipo', params.tipo);
    if (params?.categoria) query.set('categoria', params.categoria);
    if (params?.busqueda) query.set('busqueda', params.busqueda);
    const qs = query.toString();
    return this.api.request(`/memoria-agente${qs ? `?${qs}` : ''}`);
  }

  crear(payload: { titulo: string; contenido?: string; tipo?: string; categoria?: string; atajo?: string; tags?: string[] }): Promise<RecursoMemoria> {
    return this.api.post<RecursoMemoria>('/memoria-agente', payload);
  }

  subirBinario(file: File, payload: { titulo?: string; categoria?: string; atajo?: string }): Promise<RecursoMemoria> {
    const formData = new FormData();
    formData.append('file', file);
    if (payload.titulo) formData.append('titulo', payload.titulo);
    if (payload.categoria) formData.append('categoria', payload.categoria);
    if (payload.atajo) formData.append('atajo', payload.atajo);

    return this.api.post<RecursoMemoria>('/memoria-agente/upload', formData);
  }

  actualizar(id: string, payload: Partial<{ titulo: string; contenido?: string; tipo?: string; categoria?: string; atajo?: string; tags?: string[] }>): Promise<RecursoMemoria> {
    return this.api.patch<RecursoMemoria>(`/memoria-agente/${id}`, payload);
  }

  eliminar(id: string): Promise<{ ok: boolean }> {
    return this.api.delete<{ ok: boolean }>(`/memoria-agente/${id}`);
  }
}
