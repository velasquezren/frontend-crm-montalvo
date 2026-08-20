import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { ApiService, ResourceRequest } from '../../core/api/api.service';
import { ReporteConsolidado } from '../planilla-comisiones/planilla.model';

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
  private readonly http = inject(HttpClient);

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

  /**
   * Descarga el informe del mes en Excel.
   *
   * Va por HttpClient con `responseType: 'blob'` y no por un enlace directo:
   * el endpoint exige el Bearer, que solo añade el interceptor. Un <a href>
   * saldría sin cabecera de autorización y devolveria 401.
   */
  async descargarExcel(periodoId: string): Promise<{ blob: Blob; nombre: string }> {
    const respuesta = await firstValueFrom(
      this.http.get(this.api.url(`/planilla-comisiones/periodos/${periodoId}/exportar`), {
        responseType: 'blob',
        observe: 'response',
      }),
    );

    const cabecera = respuesta.headers.get('content-disposition') ?? '';
    const nombre = /filename="?([^"]+)"?/.exec(cabecera)?.[1] ?? 'informe-comisiones.xlsx';
    return { blob: respuesta.body as Blob, nombre };
  }

  obtenerConsolidado(periodoId: string): Promise<ReporteConsolidado> {
    return this.api.get<ReporteConsolidado>(
      `/planilla-comisiones/periodos/${periodoId}/reporte/consolidado`,
    );
  }
}
