import { inject, Injectable } from '@angular/core';

import { ApiService, ResourceRequest } from '../../core/api/api.service';
import { EstadoReserva } from './reserva.model';
import { AvisosCaja } from './avisos-caja/avisos-caja.model';

export interface FiltroReservas {
  desde: string;
  hasta: string;
  estado: EstadoReserva | null;
  buscar: string;
  pagina: number;
}

/**
 * Las reservas de la agenda de la clínica (solo lectura). Única fuente de las
 * URLs de `/agenda/reservas`.
 */
@Injectable({ providedIn: 'root' })
export class ReservasService {
  private readonly api = inject(ApiService);

  listarRequest(f: FiltroReservas): ResourceRequest {
    return this.api.request('/agenda/reservas', { desde: f.desde, hasta: f.hasta, estado: f.estado, buscar: f.buscar, pagina: f.pagina });
  }

  /** Las próximas de la paciente de un chat. */
  deConversacionRequest(conversacionId: string): ResourceRequest {
    return this.api.request(`/agenda/reservas/conversacion/${conversacionId}`);
  }

  /* ── Los WhatsApp de caja (solo administración) ── */

  /** `refrescar`: le vuelve a preguntar a Meta por la plantilla. */
  avisosCajaRequest(refrescar: boolean): ResourceRequest {
    return this.api.request('/agenda/avisos-caja', refrescar ? { refrescar: '1' } : undefined);
  }

  agregarNumeroCaja(nombre: string, telefono: string): Promise<AvisosCaja> {
    return this.api.post<AvisosCaja>('/agenda/avisos-caja', { nombre, telefono });
  }

  quitarNumeroCaja(id: string): Promise<AvisosCaja> {
    return this.api.delete<AvisosCaja>(`/agenda/avisos-caja/${id}`);
  }

  /** El comprobante que subió la paciente. Al pedirlo, el backend deja constancia de quién lo abrió. */
  async comprobante(id: number): Promise<{ blob: Blob; nombre: string }> {
    return this.api.getBlob(`/agenda/reservas/${id}/comprobante`, undefined, `comprobante-${id}`);
  }
}
