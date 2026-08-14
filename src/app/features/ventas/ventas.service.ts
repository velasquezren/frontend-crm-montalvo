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

  crear(venta: CrearVentaDto): Promise<Venta> {
    return this.api.post<Venta>('/ventas', venta);
  }

  subirComprobante(file: File): Promise<ComprobanteSubido> {
    const formData = new FormData();
    formData.append('file', file);
    return this.api.post<ComprobanteSubido>('/ventas/comprobante', formData);
  }
}
