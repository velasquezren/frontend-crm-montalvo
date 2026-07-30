import { inject, Injectable } from '@angular/core';

import { ApiService, ResourceRequest } from '../../core/api/api.service';

/**
 * Servicio del dominio Reportes y Analítica — consolida endpoints de KPIs y Planilla
 * para proveer información ejecutiva y comparativa mensual.
 * Ref: CRM_MANIFESTO.md §2.8 y §4.4.
 */
@Injectable({ providedIn: 'root' })
export class ReportesService {
  private readonly api = inject(ApiService);

  /** KPIs globales de ventas, leads y comisiones. */
  kpisRequest(desde?: string, hasta?: string): ResourceRequest {
    return this.api.request('/kpis/resumen', { desde, hasta });
  }

  /** Historial de periodos de planilla importados. */
  periodosRequest(): ResourceRequest {
    return this.api.request('/planilla-comisiones/periodos', { limite: 24 });
  }

  /** Consolidado detallado de un periodo específico de comisiones. */
  obtenerConsolidadoPeriodo(periodoId: string) {
    return this.api.get<any>(`/planilla-comisiones/periodos/${periodoId}/reporte/consolidado`);
  }
}
