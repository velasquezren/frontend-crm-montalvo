import { inject, Injectable } from '@angular/core';

import { ApiService, ResourceRequest } from '../../core/api/api.service';
import { nombreArchivoComisiones, ReporteConsolidado } from '../planilla-comisiones/planilla.model';

/**
 * Informe mensual de comisiones — única fuente de URLs del dominio.
 *
 * Todo sale de la planilla ya importada. Los KPIs de leads/captación NO se
 * consultan aquí: viven en el Dashboard y no se duplican.
 * Ref: CRM_MANIFESTO.md §4.4.
 */
@Injectable({ providedIn: 'root' })
export class AnaliticaService {
  private readonly api = inject(ApiService);

  /** Meses importados, para el selector de periodo. */
  periodosRequest(): ResourceRequest {
    return this.api.request('/planilla-comisiones/periodos', { limite: 24 });
  }

  /** Informe completo del mes: categorías, canales, rankings y evolución diaria. */
  analiticaRequest(periodoId: string): ResourceRequest {
    return this.api.request(`/planilla-comisiones/periodos/${periodoId}/analitica`);
  }

  /** Liquidación por vendedora del mismo periodo. */
  consolidadoRequest(periodoId: string): ResourceRequest {
    return this.api.request(`/planilla-comisiones/periodos/${periodoId}/reporte/consolidado`);
  }

  /** El mismo libro de siete hojas + una por vendedora que ve Liquidación
   *  (`PlanillaComisionesService.descargarExcel`) — un solo endpoint, dos
   *  puntos de entrada. */
  descargarExcel(periodoId: string, anio: number, mes: number): Promise<{ blob: Blob; nombre: string }> {
    return this.api.getBlob(
      `/planilla-comisiones/periodos/${periodoId}/exportar`,
      undefined,
      nombreArchivoComisiones(anio, mes),
    );
  }

  obtenerConsolidado(periodoId: string): Promise<ReporteConsolidado> {
    return this.api.get<ReporteConsolidado>(
      `/planilla-comisiones/periodos/${periodoId}/reporte/consolidado`,
    );
  }
}
