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

  /**
   * El PDF, para comprobar qué informe se va a enviar.
   *
   * Va por la API del CRM y no al enlace del paciente: ese marca «abierto por
   * el paciente», y abrirlo para revisar convertiría esa señal en mentira.
   * Como el CRM autentica por cabecera, no sirve un `<a href>`: hay que pedirlo
   * y abrir el resultado.
   */
  async pdf(informeId: string): Promise<Blob> {
    const { blob } = await this.api.getBlob(`/resultados/${informeId}/pdf`, undefined, 'informe.pdf');
    return blob;
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

  /** El enlace venció: se extiende 30 días y se vuelve a avisar al paciente. */
  renovarYEnviar(informeId: string): Promise<{ enviado: true; mensajeId: string }> {
    return this.api.post<{ enviado: true; mensajeId: string }>(`/resultados/${informeId}/renovar-y-enviar`);
  }
}
