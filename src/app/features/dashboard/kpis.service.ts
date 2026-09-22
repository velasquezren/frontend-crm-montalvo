import { inject, Injectable } from '@angular/core';

import { ApiService, ResourceRequest } from '../../core/api/api.service';
import { PeriodoKpi } from './kpis.model';

/**
 * KPIs — consolida datos de los demás dominios para el dashboard (RF-16/RF-17/RF-18).
 * El alcance por rol lo aplica el backend según el JWT, y el periodo lo
 * resuelve él en la zona de la clínica: aquí solo se elige por nombre.
 */
@Injectable({ providedIn: 'root' })
export class KpisService {
  private readonly api = inject(ApiService);

  resumenRequest(periodo: PeriodoKpi): ResourceRequest {
    return this.api.request('/kpis/resumen', { periodo });
  }
}
