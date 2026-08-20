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

  /** Ficha y línea de tiempo. Se pide al abrir el detalle, no en el listado. */
  historialPaciente(pac: string): Promise<HistorialPaciente> {
    return this.api.get<HistorialPaciente>(`/servicios/pacientes/${encodeURIComponent(pac)}`);
  }

  /** Perfil del médico. Igual que el historial: se pide al abrirlo, no en el listado. */
  perfilMedico(codigo: string): Promise<PerfilMedico> {
    return this.api.get<PerfilMedico>(`/servicios/medicos/${encodeURIComponent(codigo)}`);
  }
}
