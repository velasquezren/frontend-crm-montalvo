import { inject, Injectable } from '@angular/core';

import { ApiService, ResourceRequest } from '../../core/api/api.service';
import {
  Alertas,
  ClasifComision,
  CanalVenta,
  TipoComision,
  ConfiguracionPlanilla,
  MapeoCaptacion,
  nombreArchivoComisiones,
  Objetivo,
  PeriodoComision,
  ReglaClasificacion,
  ReglaClasificacionCreada,
  ReporteConsolidado,
  ResultadoAprobacion,
  RevisionPeriodo,
  RespuestaImportacion,
  ResultadoCalculo,
  CambiosVendedora,
  NuevaVendedora,
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
  /**
   * Por qué se saca la venta del cálculo. **El backend lo exige al excluir** y
   * lo guarda en la auditoría; al reincluir lo borra él solo.
   */
  motivoExclusion?: string;
  vendedoraId?: string;
  /** `null` devuelve la decisión al sistema. */
  comisionaPlan?: boolean | null;
}

/** Totales del filtro completo — los calcula el servidor, no la página. */
export interface TotalesVentas {
  readonly ventas: number;
  readonly monto: number;
  readonly base: number;
}

/** Subtotal de una vendedora dentro del filtro actual. */
export interface SubtotalVendedora extends TotalesVentas {
  readonly vendedoraId: string;
  readonly nombre: string;
}

/** Filtros de la tabla de vista previa. */
export interface FiltroVentas {
  pagina?: number;
  clasif?: ClasifComision;
  /** Tipo de comisión A/B/C. Agrupa varias clasificaciones, así que no se puede
   *  acotar con `clasif`: "todo lo que paga por Tipo B" cruza CIRUGIA e
   *  internaciones. */
  tipo?: TipoComision;
  /** EMPRESA/PROPIO. El backend ya lo soporta (`QueryVentasImportadasDto.canal`);
   *  faltaba exponerlo aquí. Cambia la tarifa aplicada, ver `tarifaDe()`. */
  canal?: CanalVenta;
  /** Maternidad / RA / Varios — aísla, por ejemplo, todo lo del área RA. */
  unidadNegocio?: 'MATERNIDAD' | 'RA' | 'VARIOS';
  vendedoraId?: string;
  buscar?: string;
  soloExcluidas?: boolean;
  soloSinClasificar?: boolean;
  limite?: number;
  /**
   * true = trae el mes entero de la vendedora en vez de una página.
   *
   * Lo necesita la vista de desempeño, que busca y filtra en memoria: con una
   * página, lo que no llegó no aparece al buscar y el buscador dice "no existe"
   * en vez de "no lo tengo".
   */
  mesCompleto?: boolean;
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
      tipo: filtro.tipo,
      canal: filtro.canal,
      unidadNegocio: filtro.unidadNegocio,
      vendedoraId: filtro.vendedoraId,
      buscar: filtro.buscar,
      soloExcluidas: filtro.soloExcluidas ? true : undefined,
      soloSinClasificar: filtro.soloSinClasificar ? true : undefined,
      limite: filtro.limite,
      mesCompleto: filtro.mesCompleto ? true : undefined,
    });
  }

  alertasRequest(periodoId: string): ResourceRequest {
    return this.api.request(`/planilla-comisiones/periodos/${periodoId}/alertas`);
  }

  /**
   * La liquidación del mes por persona.
   *
   * `incluirOcultas` decide si entran las vendedoras dadas de baja. **El filtro
   * lo aplica el servidor, no la pantalla**, y es a propósito: los totales del
   * pie tienen que ser la suma de las filas que se ven, y recalcularlos aquí
   * sería duplicar el criterio del backend justo en las cifras que se pagan.
   * Cambiar el interruptor vuelve a pedir el informe.
   */
  consolidadoRequest(periodoId: string, incluirOcultas = false): ResourceRequest {
    return this.api.request(`/planilla-comisiones/periodos/${periodoId}/reporte/consolidado`, {
      incluirOcultas: incluirOcultas ? true : undefined,
    });
  }

  /** Todas las líneas de desglose (tipo/canal/unidad de negocio) de todas las
   *  vendedoras liquidadas — para filtrar por un cubo concreto y ver la
   *  sumatoria, sin abrir el Excel. */
  desgloseRequest(periodoId: string, incluirOcultas = false): ResourceRequest {
    return this.api.request(`/planilla-comisiones/periodos/${periodoId}/reporte/desglose`, {
      incluirOcultas: incluirOcultas ? true : undefined,
    });
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

  /**
   * El informe completo del mes en Excel: el mismo resumen/liquidación que la
   * pantalla, más lo que la tabla web no puede mostrar por falta de ancho —
   * el desglose por tipo y sección y cada venta del mes, en una hoja aparte
   * por vendedora. Mismo endpoint que usa Analítica
   * (`AnaliticaService.descargarExcel`); dos puntos de entrada al mismo libro.
   */
  descargarExcel(
    periodoId: string,
    anio: number,
    mes: number,
    incluirOcultas = false,
  ): Promise<{ blob: Blob; nombre: string }> {
    return this.api.getBlob(
      `/planilla-comisiones/periodos/${periodoId}/exportar`,
      { incluirOcultas: incluirOcultas ? true : undefined },
      nombreArchivoComisiones(anio, mes),
    );
  }

  /**
   * El informe del mes en Word: el documento que administración revisa, edita
   * si hace falta y firma.
   *
   * No es "el Excel en otro formato". El Excel trae las 20 columnas y una hoja
   * por vendedora para auditar cómo se llegó a cada cifra; el informe responde
   * otra pregunta —cuánto se le paga a cada quien— en una hoja vertical, con
   * las tres firmas. `Elaborado` y `Revisado` los rellena el backend con el
   * usuario de la sesión, así que acá no hay nada que mandarle.
   */
  descargarInforme(
    periodoId: string,
    anio: number,
    mes: number,
    incluirOcultas = false,
  ): Promise<{ blob: Blob; nombre: string }> {
    return this.api.getBlob(
      `/planilla-comisiones/periodos/${periodoId}/exportar-word`,
      { incluirOcultas: incluirOcultas ? true : undefined },
      `informe-comisiones-${anio}-${String(mes).padStart(2, '0')}.docx`,
    );
  }

  ajustarVenta(ventaId: string, ajuste: AjusteVenta): Promise<unknown> {
    return this.api.patch(`/planilla-comisiones/ventas/${ventaId}`, ajuste);
  }

  /**
   * Decide si un plan concreto comisiona. `null` devuelve la decisión al
   * sistema, que elige los ÚLTIMOS vendidos hasta llenar el cupo.
   */
  marcarPlanComisiona(ventaId: string, comisiona: boolean | null): Promise<unknown> {
    return this.ajustarVenta(ventaId, { comisionaPlan: comisiona });
  }

  eliminarPeriodo(periodoId: string): Promise<unknown> {
    return this.api.delete(`/planilla-comisiones/periodos/${periodoId}`);
  }

  /* ── Cierre del mes ─────────────────────────────────────────────────
   *
   * **No hay un método que reciba el estado destino**, y su ausencia es
   * intencional: el backend tampoco lo tiene. Cada paso es su propia ruta con
   * sus permisos y los datos que exige, y la tabla de transiciones decide si el
   * salto es legal desde donde está el mes. El endpoint genérico que había
   * aceptaba cualquier valor del enum, así que `CERRADO → BORRADOR` pasaba.
   */

  revisionRequest(periodoId: string): ResourceRequest {
    return this.api.request(`/planilla-comisiones/periodos/${periodoId}/revision`);
  }

  obtenerRevision(periodoId: string): Promise<RevisionPeriodo> {
    return this.api.get<RevisionPeriodo>(`/planilla-comisiones/periodos/${periodoId}/revision`);
  }

  enviarARevision(periodoId: string): Promise<PeriodoComision> {
    return this.api.post<PeriodoComision>(`/planilla-comisiones/periodos/${periodoId}/revision`);
  }

  /** Si esta firma completa el conjunto, el backend cierra el mes en el acto. */
  aprobarPeriodo(periodoId: string, comentario?: string): Promise<ResultadoAprobacion> {
    return this.api.post<ResultadoAprobacion>(
      `/planilla-comisiones/periodos/${periodoId}/aprobar`,
      { comentario },
    );
  }

  rechazarPeriodo(periodoId: string, motivo: string): Promise<PeriodoComision> {
    return this.api.post<PeriodoComision>(
      `/planilla-comisiones/periodos/${periodoId}/rechazar`,
      { motivo },
    );
  }

  reabrirPeriodo(periodoId: string, motivo: string): Promise<PeriodoComision> {
    return this.api.post<PeriodoComision>(
      `/planilla-comisiones/periodos/${periodoId}/reabrir`,
      { motivo },
    );
  }

  registrarPago(periodoId: string): Promise<PeriodoComision> {
    return this.api.post<PeriodoComision>(`/planilla-comisiones/periodos/${periodoId}/pagar`);
  }

  /** Alta manual, para quien cobra por planilla pero no vende (marketing). */
  crearVendedora(datos: NuevaVendedora): Promise<Vendedora> {
    return this.api.post<Vendedora>('/planilla-comisiones/vendedoras', datos);
  }

  actualizarVendedora(id: string, cambios: CambiosVendedora): Promise<Vendedora> {
    return this.api.patch<Vendedora>(`/planilla-comisiones/vendedoras/${id}`, cambios);
  }

  /* ── Configuración ──────────────────────────────────────────────────── */

  obtenerConfiguracion(): Promise<ConfiguracionPlanilla> {
    return this.api.get<ConfiguracionPlanilla>('/planilla-comisiones/configuracion');
  }

  obtenerConsolidado(periodoId: string, incluirOcultas = false): Promise<ReporteConsolidado> {
    return this.api.get<ReporteConsolidado>(
      `/planilla-comisiones/periodos/${periodoId}/reporte/consolidado`,
      { incluirOcultas: incluirOcultas ? true : undefined },
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

  /** Mismo tramo que `actualizarNivelCirugia`, tabla aparte: ver `NivelTipoARA`. */
  actualizarNivelTipoARA(
    nivel: number,
    datos: { montoDesde: number; montoHasta: number; pctEmpresa: number; pctPropio: number },
  ): Promise<unknown> {
    return this.api.patch(`/planilla-comisiones/configuracion/niveles-tipo-a-ra/${nivel}`, datos);
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

  /**
   * Cambia un parámetro global del cálculo.
   *
   * El endpoint existía desde el principio pero la interfaz no lo exponía, así
   * que reglas como "el área RA no comisiona" solo se podían tocar por SQL.
   */
  actualizarParametro(clave: string, valor: number): Promise<unknown> {
    return this.api.patch(`/planilla-comisiones/configuracion/parametros/${clave}`, { valor });
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

  crearRegla(regla: Partial<ReglaClasificacion>): Promise<ReglaClasificacionCreada> {
    return this.api.post<ReglaClasificacionCreada>('/planilla-comisiones/configuracion/reglas', regla);
  }

  eliminarRegla(id: string): Promise<unknown> {
    return this.api.delete(`/planilla-comisiones/configuracion/reglas/${id}`);
  }
}
