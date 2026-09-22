import { inject, Injectable } from '@angular/core';

import { ApiService, ResourceRequest } from '../../core/api/api.service';

/**
 * Entrega de informes del portal de resultados al WhatsApp del paciente.
 *
 * Quién puede usarlo lo decide el backend por la membresía en la línea de
 * resultados, no por el rango del rol: un agente de ventas recibe 404 aunque
 * su rango sea mayor que el del asistente.
 */
@Injectable({ providedIn: 'root' })
export class ResultadosService {
  private readonly api = inject(ApiService);

  /** Cola de entrega. La paginación la manda el portal, que tiene el total real. */
  pendientesRequest(pagina: number): ResourceRequest {
    return this.api.request('/resultados/pendientes', { pagina });
  }

  enviar(informeId: string): Promise<{ enviado: true; mensajeId: string }> {
    return this.api.post<{ enviado: true; mensajeId: string }>(`/resultados/${informeId}/enviar`);
  }
}
