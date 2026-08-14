import { inject, Injectable } from '@angular/core';

import { ApiService, ResourceRequest } from '../../core/api/api.service';
import {
  Alertas,
  ClasifComision,
  CanalVenta,
  ConfiguracionPlanilla,
  MapeoCaptacion,
  Objetivo,
  PeriodoComision,
  ReglaClasificacion,
  ReporteConsolidado,
  RespuestaImportacion,
  ResultadoCalculo,
  CambiosVendedora,
  TipoVendedora,
  Vendedora,
} from './planilla.model';

/** Campos que admite la corrección manual de una fila importada. */
export interface AjusteVenta {
  clasif?: ClasifComision;
  canal?: 'EMPRESA' | 'PROPIO';
  unidadNegocio?: 'MATERNIDAD' | 'RA' | 'VARIOS';
  nivel?: 'BRONCE' | 'SILVER' | 'GOLD';
  comisionable?: boolean;
  vendedoraId?: string;
  /** `null` devuelve la decisión al sistema. */
  comisionaPlan?: boolean | null;
}

/** Filtros de la tabla de vista previa. */
export interface FiltroVentas {
  pagina?: number;
  clasif?: ClasifComision;
  buscar?: string;
  soloExcluidas?: boolean;
  soloSinClasificar?: boolean;
  limite?: number;
}

/**
 * Planilla de comisiones — única fuente de URLs del dominio.
 * Todo el módulo es exclusivo de ADMIN (el backend lo bloquea con @Roles).
 */
@Injectable({ providedIn: 'root' })
export class PlanillaComisionesService {
  private readonly api = inject(ApiService);

  /* ── Lecturas reactivas (las consume httpResource en la página) ────── */

  periodosRequest(): ResourceRequest {
    return this.api.request('/planilla-comisiones/periodos', { limite: 100 });
  }

  ventasRequest(periodoId: string, filtro: FiltroVentas): ResourceRequest {
    return this.api.request(`/planilla-comisiones/periodos/${periodoId}/ventas`, {
      pagina: filtro.pagina,
      clasif: filtro.clasif,
      buscar: filtro.buscar,
      soloExcluidas: filtro.soloExcluidas ? true : undefined,
      soloSinClasificar: filtro.soloSinClasificar ? true : undefined,
      limite: filtro.limite,
    });
  }

  alertasRequest(periodoId: string): ResourceRequest {
    return this.api.request(`/planilla-comisiones/periodos/${periodoId}/alertas`);
  }

  consolidadoRequest(periodoId: string): ResourceRequest {
    return this.api.request(`/planilla-comisiones/periodos/${periodoId}/reporte/consolidado`);
  }

  /** Resumen anual por vendedora: doce meses y cuatro trimestres. Solo ADMIN. */
  resumenAnualRequest(anio: number): ResourceRequest {
    return this.api.request('/planilla-comisiones/anual', { anio: String(anio) });
  }

  vendedorasRequest(): ResourceRequest {
    return this.api.request('/planilla-comisiones/vendedoras');
  }

  configuracionRequest(): ResourceRequest {
    return this.api.request('/planilla-comisiones/configuracion');
  }

  /* ── Comandos ───────────────────────────────────────────────────────── */

  /**
   * Sube el Excel mensual. Va como `multipart/form-data`: el navegador pone
   * el boundary correcto, por eso no se fija Content-Type a mano.
   */
  importar(archivo: File, anio?: number, mes?: number): Promise<RespuestaImportacion> {
    const datos = new FormData();
    datos.append('archivo', archivo);
    if (anio) datos.append('anio', String(anio));
    if (mes) datos.append('mes', String(mes));
    return this.api.post<RespuestaImportacion>('/planilla-comisiones/importar', datos);
  }

  calcular(periodoId: string): Promise<ResultadoCalculo> {
    return this.api.post<ResultadoCalculo>(`/planilla-comisiones/periodos/${periodoId}/calcular`);
  }

  ajustarVenta(ventaId: string, ajuste: AjusteVenta): Promise<unknown> {
    return this.api.patch(`/planilla-comisiones/ventas/${ventaId}`, ajuste);
  }

  /**
   * Decide si un plan concreto comisiona. `null` devuelve la decisión al
   * sistema, que elige los de base más baja hasta llenar el cupo.
   */
  marcarPlanComisiona(ventaId: string, comisiona: boolean | null): Promise<unknown> {
    return this.ajustarVenta(ventaId, { comisionaPlan: comisiona });
  }

  eliminarPeriodo(periodoId: string): Promise<unknown> {
    return this.api.delete(`/planilla-comisiones/periodos/${periodoId}`);
  }

  cambiarEstadoPeriodo(periodoId: string, estado: string): Promise<PeriodoComision> {
    return this.api.patch<PeriodoComision>(
      `/planilla-comisiones/periodos/${periodoId}/estado`,
      { estado },
    );
  }

  actualizarVendedora(id: string, cambios: CambiosVendedora): Promise<Vendedora> {
    return this.api.patch<Vendedora>(`/planilla-comisiones/vendedoras/${id}`, cambios);
  }

  /* ── Configuración ──────────────────────────────────────────────────── */

  obtenerConfiguracion(): Promise<ConfiguracionPlanilla> {
    return this.api.get<ConfiguracionPlanilla>('/planilla-comisiones/configuracion');
  }

  obtenerConsolidado(periodoId: string): Promise<ReporteConsolidado> {
    return this.api.get<ReporteConsolidado>(
      `/planilla-comisiones/periodos/${periodoId}/reporte/consolidado`,
    );
  }

  obtenerAlertas(periodoId: string): Promise<Alertas> {
    return this.api.get<Alertas>(`/planilla-comisiones/periodos/${periodoId}/alertas`);
  }

  actualizarTarifaPlan(clave: string, pctEmpresa: number, pctPropio: number): Promise<unknown> {
    return this.api.patch(`/planilla-comisiones/configuracion/tarifas-plan/${clave}`, {
      pctEmpresa,
      pctPropio,
    });
  }

  actualizarTarifaServicio(
    clasif: ClasifComision,
    pctEmpresa: number,
    pctPropio: number,
  ): Promise<unknown> {
    return this.api.patch(`/planilla-comisiones/configuracion/tarifas-servicio/${clasif}`, {
      pctEmpresa,
      pctPropio,
    });
  }

  actualizarNivelCirugia(
    nivel: number,
    datos: { montoDesde: number; montoHasta: number; pctEmpresa: number; pctPropio: number },
  ): Promise<unknown> {
    return this.api.patch(`/planilla-comisiones/configuracion/niveles-cirugia/${nivel}`, datos);
  }

  actualizarTarifaRa(
    id: string,
    datos: { montoEmpresa: number; montoPropio: number },
  ): Promise<unknown> {
    return this.api.patch(`/planilla-comisiones/configuracion/tarifas-ra/${id}`, datos);
  }

  actualizarObjetivo(
    id: string,
    datos: {
      planpaqMinimos: number;
      planninMinimos: number;
      montoMensualUsd: number;
      montoTrimestralUsd: number;
    },
  ): Promise<unknown> {
    return this.api.patch(`/planilla-comisiones/configuracion/objetivos/${id}`, datos);
  }

  /** Metas que rigen en un periodo: las propias del mes o, si no hay, las base. */
  objetivosDelPeriodo(periodoId: string): Promise<Objetivo[]> {
    return this.api.get<Objetivo[]>(`/planilla-comisiones/periodos/${periodoId}/objetivos`);
  }

  guardarObjetivoDePeriodo(
    periodoId: string,
    tipo: TipoVendedora,
    datos: {
      planpaqMinimos: number;
      planninMinimos: number;
      montoMensualUsd: number;
      montoTrimestralUsd: number;
    },
  ): Promise<Objetivo> {
    return this.api.put<Objetivo>(
      `/planilla-comisiones/periodos/${periodoId}/objetivos/${tipo}`,
      datos,
    );
  }

  /** Quita la meta propia del mes: vuelve a regir la base. */
  eliminarObjetivoDePeriodo(periodoId: string, tipo: TipoVendedora): Promise<unknown> {
    return this.api.delete(`/planilla-comisiones/periodos/${periodoId}/objetivos/${tipo}`);
  }

  /** Devuelve el registro ya guardado (con el valor normalizado por el backend). */
  guardarCaptacion(valor: string, canal: CanalVenta): Promise<MapeoCaptacion> {
    return this.api.put<MapeoCaptacion>(
      `/planilla-comisiones/configuracion/captacion/${encodeURIComponent(valor)}`,
      { canal },
    );
  }

  eliminarCaptacion(valor: string): Promise<unknown> {
    return this.api.delete(`/planilla-comisiones/configuracion/captacion/${encodeURIComponent(valor)}`);
  }

  crearRegla(regla: Partial<ReglaClasificacion>): Promise<ReglaClasificacion> {
    return this.api.post<ReglaClasificacion>('/planilla-comisiones/configuracion/reglas', regla);
  }

  eliminarRegla(id: string): Promise<unknown> {
    return this.api.delete(`/planilla-comisiones/configuracion/reglas/${id}`);
  }
}
