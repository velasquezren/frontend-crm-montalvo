import { inject, Injectable } from '@angular/core';

import { ApiService, ResourceRequest } from '../../core/api/api.service';

/**
 * KPIs — consolida datos de los demás dominios para el dashboard (RF-16/RF-17/RF-18).
 * El alcance por rol lo aplica el backend según el JWT.
 */
@Injectable({ providedIn: 'root' })
export class KpisService {
  private readonly api = inject(ApiService);

  resumenRequest(desde?: string, hasta?: string): ResourceRequest {
    return this.api.request('/kpis/resumen', { desde, hasta });
  }
}
