import { inject, Injectable } from '@angular/core';

import { ApiService, ResourceRequest } from '../../../../core/api/api.service';
import { FuenteTipoCambio, ModoTipoCambio } from '../../../../core/api/db-enums';

/**
 * El criterio con el que TODO el CRM convierte entre Bs y dólares.
 *
 * `FIJO` = la clínica opera a un valor pactado (6,97), que es como se liquidan
 * las comisiones. `AUTOMATICO` = sigue la serie diaria del BCB. La serie se
 * guarda igual en los dos modos: cambiar a fijo no apaga la recolección.
 */
export interface ConfiguracionTipoCambio {
  readonly modo: ModoTipoCambio;
  readonly valorFijo: number;
  /** El último oficial registrado, se use o no — para poder compararlos. */
  readonly oficialDelDia: number | null;
  readonly actualizadoEn: string | null;
}

/** Un día de la serie histórica. `valor` llega como texto: Prisma serializa Decimal así. */
export interface DiaTipoCambio {
  readonly fecha: string;
  readonly valor: string;
  readonly fuente: FuenteTipoCambio;
}

export type { ModoTipoCambio };

export type MotivoSincronizacion =
  | 'ok'
  | 'sin_cambios'
  | 'ya_hay_valor_manual'
  | 'fetch_fallido'
  | 'respuesta_invalida';

export interface ResultadoSincronizacionTC {
  readonly actualizado: boolean;
  readonly motivo: MotivoSincronizacion;
  readonly fecha?: string;
  readonly valor?: number;
}

/**
 * Administración del historial de tipo de cambio (`GET/PATCH /tipo-cambio/*`).
 * No confundir con `MonedaService` (core): ese solo LEE el vigente para el
 * selector Bs/$us; este además corrige un día y dispara la sincronización
 * manual — por eso vive aquí, no en `core/moneda`.
 */
@Injectable({ providedIn: 'root' })
export class TipoCambioAdminService {
  private readonly api = inject(ApiService);

  historialRequest(anio: number, mes: number): ResourceRequest {
    return this.api.request('/tipo-cambio/historial', { anio, mes });
  }

  configuracionRequest(): ResourceRequest {
    return this.api.request('/tipo-cambio/configuracion');
  }

  /** Cambia el criterio de conversión de todo el CRM. Solo SUPER_ADMIN. */
  guardarConfiguracion(datos: {
    modo?: ModoTipoCambio;
    valorFijo?: number;
  }): Promise<ConfiguracionTipoCambio> {
    return this.api.patch<ConfiguracionTipoCambio>('/tipo-cambio/configuracion', datos);
  }

  corregir(fecha: string, valor: number): Promise<DiaTipoCambio> {
    return this.api.patch<DiaTipoCambio>(`/tipo-cambio/${fecha}`, { valor });
  }

  sincronizar(): Promise<ResultadoSincronizacionTC> {
    return this.api.post<ResultadoSincronizacionTC>('/tipo-cambio/sincronizar');
  }
}
