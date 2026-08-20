import { inject, Injectable } from '@angular/core';

import { ApiService, ResourceRequest } from '../../core/api/api.service';
import { HistorialPaciente, PerfilMedico } from './servicios.model';

/** Filtros del dashboard. Sin ninguno, mira todo el historial cargado. */
export interface FiltroServicios {
  periodoId?: string;
  modulo?: string;
}

/**
 * Historial de servicios — única fuente de URLs del dominio.
 *
 * Todo el módulo es de lectura: no hay un solo método que escriba. Los listados
 * devuelven la petición para que la reactividad viva en la página, igual que en
 * el resto del CRM.
 */
@Injectable({ providedIn: 'root' })
export class ServiciosService {
  private readonly api = inject(ApiService);

  private readonly cacheHistorial = new Map<string, { data: HistorialPaciente; expira: number }>();
  private readonly cacheMedico = new Map<string, { data: PerfilMedico; expira: number }>();
  private readonly TTL_MS = 5 * 60 * 1000; // 5 minutos

  dashboardRequest(filtro: FiltroServicios): ResourceRequest {
    return this.api.request('/servicios/dashboard', {
      periodoId: filtro.periodoId,
      modulo: filtro.modulo,
    });
  }

  /** Meses importados. Se reutiliza el listado de la planilla: es el mismo dato. */
  periodosRequest(): ResourceRequest {
    return this.api.request('/planilla-comisiones/periodos', { limite: 100 });
  }

  demografiaRequest(): ResourceRequest {
    return this.api.request('/servicios/demografia');
  }

  pacientesRequest(pagina: number, busqueda?: string, orden?: string, direccion?: string): ResourceRequest {
    return this.api.request('/servicios/pacientes', { pagina, busqueda, orden, direccion });
  }

  medicosRequest(pagina: number, busqueda?: string, orden?: string, direccion?: string): ResourceRequest {
    return this.api.request('/servicios/medicos', { pagina, busqueda, orden, direccion });
  }

  getHistorialEnCache(pac: string): HistorialPaciente | null {
    const key = pac.toUpperCase().trim();
    const entry = this.cacheHistorial.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expira) {
      this.cacheHistorial.delete(key);
      return null;
    }
    return entry.data;
  }

  getPerfilMedicoEnCache(codigo: string): PerfilMedico | null {
    const key = codigo.trim();
    const entry = this.cacheMedico.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expira) {
      this.cacheMedico.delete(key);
      return null;
    }
    return entry.data;
  }

  /** Ficha y línea de tiempo. Se pide al abrir el detalle, no en el listado. */
  async historialPaciente(pac: string): Promise<HistorialPaciente> {
    const key = pac.toUpperCase().trim();
    const cached = this.getHistorialEnCache(key);
    if (cached) return cached;

    const data = await this.api.get<HistorialPaciente>(`/servicios/pacientes/${encodeURIComponent(key)}`);
    this.cacheHistorial.set(key, { data, expira: Date.now() + this.TTL_MS });
    return data;
  }

  /** Perfil del médico. Igual que el historial: se pide al abrirlo, no en el listado. */
  async perfilMedico(codigo: string): Promise<PerfilMedico> {
    const key = codigo.trim();
    const cached = this.getPerfilMedicoEnCache(key);
    if (cached) return cached;

    const data = await this.api.get<PerfilMedico>(`/servicios/medicos/${encodeURIComponent(key)}`);
    this.cacheMedico.set(key, { data, expira: Date.now() + this.TTL_MS });
    return data;
  }
}
