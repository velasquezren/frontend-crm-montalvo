import { inject, Injectable } from '@angular/core';

import { ApiService, ResourceRequest } from '../../core/api/api.service';
import { EstadoCola } from './resultado.model';

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

  /**
   * Cola de entrega, por pestaña. Filtrar y paginar lo hace el backend —con el
   * portal— sobre la lista entera de cada pestaña: filtrar aquí una página ya
   * cortada diría «no hay más» con informes en la página siguiente.
   */
  pendientesRequest(filtro: { pagina: number; estado: EstadoCola; busqueda?: string }): ResourceRequest {
    return this.api.request('/resultados/pendientes', filtro);
  }

  /**
   * El enlace para revisar el informe antes de enviarlo: la vista del portal
   * de resultados, con el visor del médico y la versión liviana del PDF.
   *
   * No es el enlace del paciente: ese marca «abierto por el paciente», y
   * abrirlo para revisar convertiría esa señal en mentira. Dura 10 minutos.
   */
  enlaceRevision(informeId: string): Promise<{ url: string; expiraEn: string }> {
    return this.api.post<{ url: string; expiraEn: string }>(`/resultados/${informeId}/revision`);
  }

  enviar(informeId: string): Promise<{ enviado: true; mensajeId: string }> {
    return this.api.post<{ enviado: true; mensajeId: string }>(`/resultados/${informeId}/enviar`);
  }

  /**
   * Corrige el teléfono de la ficha a la que va el aviso de este informe.
   *
   * Sobre el INFORME y no sobre la ficha: la asistente no entra en Clientes
   * —esa ruta exige rango de agente y le respondía 403—, y el servidor decide
   * qué ficha es con el mismo cruce por PAC o CI de la cola.
   */
  corregirTelefono(informeId: string, telefono: string): Promise<{ clienteId: string; telefono: string }> {
    return this.api.patch<{ clienteId: string; telefono: string }>(`/resultados/${informeId}/telefono`, { telefono });
  }

  /** Alta de la ficha del paciente del informe: nombre y PAC los pone el portal. */
  crearFicha(informeId: string, telefono: string): Promise<{ clienteId: string }> {
    return this.api.post<{ clienteId: string }>(`/resultados/${informeId}/ficha`, { telefono });
  }

  /**
   * El número ya tiene una ficha sin PAC y la asistente confirmó que es la
   * misma paciente: se le pone el PAC del informe. El servidor la busca por ese
   * teléfono; no viaja ningún id de ficha.
   */
  vincularFicha(informeId: string, telefono: string): Promise<{ clienteId: string }> {
    return this.api.post<{ clienteId: string }>(`/resultados/${informeId}/vincular`, { telefono });
  }

  /** El enlace venció: se extiende 30 días y se vuelve a avisar al paciente. */
  renovarYEnviar(informeId: string): Promise<{ enviado: true; mensajeId: string }> {
    return this.api.post<{ enviado: true; mensajeId: string }>(`/resultados/${informeId}/renovar-y-enviar`);
  }
}
