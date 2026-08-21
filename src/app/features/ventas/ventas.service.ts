import { inject, Injectable } from '@angular/core';

import { ApiService, ResourceRequest } from '../../core/api/api.service';
import { EstadoVenta } from '../../shared/models/estados.model';
import { Venta } from './venta.model';

/** El agente que cierra lo fija el backend desde el JWT (RF-12), no se envía. */
export interface CrearVentaDto {
  clienteId: string;
  producto: string;
  /** Monto en bolivianos (Bs). */
  monto: number;
  estado?: EstadoVenta;
  metodoPago?: string;
  comprobante?: string;
  comprobanteKey?: string;
  comprobanteMime?: string;
  comprobanteNombre?: string;
  medico?: string;
  modulo?: string;
  notas?: string;
  /** Lead que originó esta venta, si el agente lo indicó. */
  leadId?: string;
  motivoPerdida?: string;
}

export interface ComprobanteSubido {
  comprobanteKey: string;
  comprobanteMime: string;
  comprobanteNombre: string;
  comprobanteUrl: string;
}

/**
 * Ventas — registro de cierres (RF-11/RF-12).
 * Una venta GANADA dispara comisión y recategorización del cliente en el backend.
 */
@Injectable({ providedIn: 'root' })
export class VentasService {
  private readonly api = inject(ApiService);

  listarRequest(estado?: EstadoVenta, pagina?: number, limite?: number): ResourceRequest {
    return this.api.request('/ventas', { estado, pagina, limite });
  }

  /**
   * Servicios y médicos que la clínica ya facturó, para autocompletar el modal.
   *
   * Se pide una vez al abrirlo y el backend lo cachea una hora: son 246
   * servicios y 65 médicos, no crecen durante la jornada.
   */
  catalogoRequest(): ResourceRequest {
    return this.api.request('/ventas/catalogo');
  }

  crear(venta: CrearVentaDto): Promise<Venta> {
    return this.api.post<Venta>('/ventas', venta);
  }

  /**
   * Cambio de estado (solo ADMIN, el backend lo exige). `motivoPerdida` es
   * obligatorio cuando `estado = 'PERDIDA'` — la página abre un modal a
   * pedirlo antes de llamar acá.
   */
  cambiarEstado(id: string, estado: EstadoVenta, motivoPerdida?: string): Promise<Venta> {
    return this.api.patch<Venta>(`/ventas/${id}/estado`, { estado, motivoPerdida });
  }

  subirComprobante(file: File): Promise<ComprobanteSubido> {
    const formData = new FormData();
    formData.append('file', file);
    return this.api.post<ComprobanteSubido>('/ventas/comprobante', formData);
  }
}
