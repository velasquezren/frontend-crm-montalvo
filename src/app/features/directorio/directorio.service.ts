import { inject, Injectable } from '@angular/core';

import { ApiService, ResourceRequest } from '../../core/api/api.service';
import { BloqueEditable, Especialidad, FichaMedico } from './directorio.model';

export interface FiltroFichas {
  readonly buscar: string;
  readonly especialidadId: string;
  readonly publicado: boolean | null;
  readonly pagina: number;
}

export interface CambiosFicha {
  nombrePublico?: string;
  resumen?: string;
  biografia?: string;
  matricula?: string | null;
  precioConsulta?: number | null;
  medicoId?: string | null;
  orden?: number;
  especialidadIds?: string[];
}

/**
 * El directorio médico. Leerlo: cualquier sesión (recepción contesta «¿qué días
 * atiende la doctora?»). Escribirlo: administración. El backend lo exige.
 */
@Injectable({ providedIn: 'root' })
export class DirectorioService {
  private readonly api = inject(ApiService);

  /* ── Especialidades ── */

  especialidadesRequest(pagina: number, incluirInactivas: boolean): ResourceRequest {
    return this.api.request('/directorio/especialidades', { pagina, incluirInactivas: incluirInactivas ? 'true' : undefined });
  }

  /** Las activas, para los selectores (promociones, fichas). Tope de 100: son decenas. */
  especialidadesActivasRequest(): ResourceRequest {
    return this.api.request('/directorio/especialidades', { limite: 100 });
  }

  crearEspecialidad(datos: { nombre: string; descripcion?: string; orden?: number }): Promise<Especialidad> {
    return this.api.post<Especialidad>('/directorio/especialidades', datos);
  }

  actualizarEspecialidad(id: string, datos: { nombre?: string; descripcion?: string; orden?: number; activa?: boolean }): Promise<Especialidad> {
    return this.api.patch<Especialidad>(`/directorio/especialidades/${id}`, datos);
  }

  /* ── Fichas ── */

  fichasRequest(filtro: FiltroFichas): ResourceRequest {
    return this.api.request('/directorio/medicos', {
      buscar: filtro.buscar.trim(),
      especialidadId: filtro.especialidadId,
      publicado: filtro.publicado === null ? undefined : String(filtro.publicado),
      pagina: filtro.pagina,
    });
  }

  /** Todas, para elegir médicos en una promoción. */
  fichasParaElegirRequest(): ResourceRequest {
    return this.api.request('/directorio/medicos', { limite: 100 });
  }

  fichaRequest(id: string): ResourceRequest {
    return this.api.request(`/directorio/medicos/${id}`);
  }

  medicosSinFichaRequest(buscar: string): ResourceRequest {
    return this.api.request('/directorio/medicos/sin-ficha', { buscar: buscar.trim(), limite: 20 });
  }

  crearFicha(datos: { nombrePublico: string; medicoId?: string; especialidadIds?: string[] }): Promise<FichaMedico> {
    return this.api.post<FichaMedico>('/directorio/medicos', datos);
  }

  actualizarFicha(id: string, version: number, cambios: CambiosFicha): Promise<FichaMedico> {
    return this.api.patch<FichaMedico>(`/directorio/medicos/${id}`, { ...cambios, version });
  }

  guardarHorario(id: string, version: number, bloques: readonly BloqueEditable[]): Promise<FichaMedico> {
    return this.api.put<FichaMedico>(`/directorio/medicos/${id}/horario`, {
      version,
      bloques: bloques.map(b => ({ diaSemana: b.diaSemana, desde: b.desde, hasta: b.hasta, lugar: b.lugar.trim() || null })),
    });
  }

  agregarAusencia(id: string, datos: { desde: string; hasta: string; motivoPublico?: string }): Promise<unknown> {
    return this.api.post(`/directorio/medicos/${id}/ausencias`, datos);
  }

  quitarAusencia(id: string, ausenciaId: string): Promise<unknown> {
    return this.api.delete(`/directorio/medicos/${id}/ausencias/${ausenciaId}`);
  }

  publicar(id: string, publicado: boolean): Promise<FichaMedico> {
    return this.api.put<FichaMedico>(`/directorio/medicos/${id}/publicacion`, { publicado });
  }

  subirFoto(id: string, archivo: File): Promise<FichaMedico> {
    const datos = new FormData();
    datos.append('archivo', archivo);
    return this.api.post<FichaMedico>(`/directorio/medicos/${id}/foto`, datos);
  }

  quitarFoto(id: string): Promise<FichaMedico> {
    return this.api.delete<FichaMedico>(`/directorio/medicos/${id}/foto`);
  }
}
