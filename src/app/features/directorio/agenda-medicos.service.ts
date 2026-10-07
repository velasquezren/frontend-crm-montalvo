import { inject, Injectable } from '@angular/core';

import { ApiService, ResourceRequest } from '../../core/api/api.service';
import { DatosMedicoAgenda, EstadoMedicoAgenda, FichaMedicoAgenda } from './agenda-medicos.model';

export interface FiltroMedicosAgenda {
  readonly buscar: string;
  readonly especialidad: string;
  readonly estado: EstadoMedicoAgenda | null;
  readonly pagina: number;
}

/**
 * Médicos, horarios y especialidades de la agenda de la clínica. Única fuente
 * de las URLs de `/agenda/medicos`. Ven recepción, asistencia y administración;
 * editan recepción y administración (el backend lo exige).
 */
@Injectable({ providedIn: 'root' })
export class AgendaMedicosService {
  private readonly api = inject(ApiService);

  listarRequest(f: FiltroMedicosAgenda): ResourceRequest {
    return this.api.request('/agenda/medicos', { buscar: f.buscar, especialidad: f.especialidad, estado: f.estado, pagina: f.pagina });
  }

  fichaRequest(id: number): ResourceRequest {
    return this.api.request(`/agenda/medicos/${id}`);
  }

  /** Todas las especialidades escritas en la agenda (son decenas: tope de 100). */
  especialidadesRequest(): ResourceRequest {
    return this.api.request('/agenda/medicos/especialidades', { limite: 100 });
  }

  bancosRequest(): ResourceRequest {
    return this.api.request('/agenda/medicos/bancos');
  }

  actualizar(id: number, version: string, datos: DatosMedicoAgenda): Promise<FichaMedicoAgenda> {
    return this.api.patch<FichaMedicoAgenda>(`/agenda/medicos/${id}`, { ...datos, version });
  }

  /** Deja encendidas exactamente `activas` y apaga el resto. */
  guardarHorario(id: number, version: string, activas: { dia: string; hora: string }[]): Promise<FichaMedicoAgenda> {
    return this.api.put<FichaMedicoAgenda>(`/agenda/medicos/${id}/horario`, { version, activas });
  }

  crear(codigo: string, datos: DatosMedicoAgenda): Promise<FichaMedicoAgenda> {
    return this.api.post<FichaMedicoAgenda>('/agenda/medicos', { ...datos, codigo });
  }

  /** Renombra (o unifica, si `nueva` ya existe) una especialidad en todos sus médicos. */
  renombrarEspecialidad(actual: string, nueva: string): Promise<{ medicos: number }> {
    return this.api.post<{ medicos: number }>('/agenda/medicos/especialidades/renombrar', { actual, nueva });
  }
}
