import { DatePipe, DecimalPipe } from '@angular/common';
import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';

import { RespuestaPaginada } from '../../../../core/api/pagination.model';
import { AvatarComponent } from '../../../../shared/components/avatar/avatar.component';
import { BadgeComponent } from '../../../../shared/components/badge/badge.component';
import { EmptyStateComponent } from '../../../../shared/components/empty-state/empty-state.component';
import { IconComponent } from '../../../../shared/components/icon/icon.component';
import { LoadingSkeletonComponent } from '../../../../shared/components/loading-skeleton/loading-skeleton.component';
import { PageHeaderComponent } from '../../../../shared/components/page-header/page-header.component';
import { TableComponent } from '../../../../shared/components/table/table.component';
import { MonedaPipe } from '../../../../shared/pipes/moneda.pipe';
import {
  CLASIF_LABEL,
  ClasifComision,
  ESTADO_PERIODO_LABEL,
  EstadoPeriodo,
  FilaConsolidado,
  MESES,
  PeriodoComision,
  ReporteConsolidado,
  TIPO_LABEL,
  TipoComision,
  VentaImportada,
} from '../../../planilla-comisiones/planilla.model';
import { PlanillaComisionesService } from '../../../planilla-comisiones/planilla-comisiones.service';

/**
 * Ficha 360° de Desempeño por Agente / Ejecutiva Comercial.
 * Permite a administración y gerencia:
 * - Seleccionar cualquier agente del equipo comercial.
 * - Ver termómetro de cumplimiento de metas de maternidad (franquicia).
 * - Ver nivel acumulado de cirugías (Nivel 1 al 6) y distancia al siguiente tramo.
 * - Ver desglose líquido a pagar (Sueldo Base + Tipo A/B/C + Bonos = Total BOB).
 * - Inspeccionar las ventas individuales del mes de esa ejecutiva.
 */
@Component({
  selector: 'app-desempeno-agentes',
  imports: [
    DatePipe,
    DecimalPipe,
    MonedaPipe,
    PageHeaderComponent,
    AvatarComponent,
    BadgeComponent,
    EmptyStateComponent,
    IconComponent,
    LoadingSkeletonComponent,
    TableComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './desempeno-agentes.component.html',
  styleUrl: './desempeno-agentes.component.css',
})
export class DesempenoAgentesComponent {
  private readonly service = inject(PlanillaComisionesService);

  protected readonly clasifLabel = CLASIF_LABEL;
  protected readonly tipoLabel = TIPO_LABEL;
  protected readonly estadoLabel = ESTADO_PERIODO_LABEL;

  /* ── Estado Reactivo ─────────────────────────────────────────────────── */
  readonly periodoId = signal<string | null>(null);
  readonly vendedoraIdSeleccionada = signal<string | null>(null);

  /* ── Recursos HTTP Reactivos (Signals) ────────────────────────────────── */
  protected readonly periodos = httpResource<RespuestaPaginada<PeriodoComision>>(() =>
    this.service.periodosRequest(),
  );

  protected readonly consolidado = httpResource<ReporteConsolidado>(() => {
    const pId = this.periodoIdEfectivo();
    return pId ? this.service.consolidadoRequest(pId) : undefined;
  });

  protected readonly ventas = httpResource<RespuestaPaginada<VentaImportada>>(() => {
    const pId = this.periodoIdEfectivo();
    const vId = this.vendedoraIdSeleccionada();
    if (!pId || !vId) return undefined;
    return this.service.ventasRequest(pId, {
      vendedoraId: vId,
      limite: 100,
    });
  });

  /* ── Computados ──────────────────────────────────────────────────────── */

  /** Periodo activo: el seleccionado manualmente o el más reciente calculado. */
  readonly periodoIdEfectivo = computed<string | null>(() => {
    const manual = this.periodoId();
    if (manual) return manual;
    const lista: PeriodoComision[] = this.periodos.value()?.datos ?? [];
    const calculado = lista.find((p: PeriodoComision) => p.estado === 'CALCULADO');
    return calculado ? calculado.id : (lista[0]?.id ?? null);
  });

  readonly periodoActual = computed<PeriodoComision | null>(() => {
    const id = this.periodoIdEfectivo();
    if (!id) return null;
    const lista: PeriodoComision[] = this.periodos.value()?.datos ?? [];
    return lista.find((p: PeriodoComision) => p.id === id) ?? null;
  });

  readonly vendedoras = computed<FilaConsolidado[]>(() => {
    return this.consolidado.value()?.filas ?? [];
  });

  readonly vendedoraActual = computed<FilaConsolidado | null>(() => {
    const id = this.vendedoraIdSeleccionada();
    const lista = this.vendedoras();
    if (id) {
      const encontrada = lista.find(v => v.vendedoraId === id);
      if (encontrada) return encontrada;
    }
    return lista[0] ?? null;
  });

  /** Progreso de meta de maternidad (ej. 6 planes vs 4 objetivo = 150%). */
  readonly metaMaternidadInfo = computed(() => {
    const v = this.vendedoraActual();
    if (!v) return null;
    const esJefa = v.tipo === 'JEFA';
    const metaMinima = esJefa ? 6 : 4;
    const vendidos = v.planesVendidos;
    const porcentaje = Math.min(Math.round((vendidos / metaMinima) * 100), 200);
    const comisionables = Math.max(0, vendidos - metaMinima);
    const supera = vendidos > metaMinima;
    const iguala = vendidos === metaMinima;

    return {
      metaMinima,
      vendidos,
      porcentaje,
      comisionables,
      supera,
      iguala,
    };
  });

  /** Información del nivel de cirugías y distancia al siguiente nivel. */
  readonly nivelCirugiaInfo = computed(() => {
    const v = this.vendedoraActual();
    if (!v) return null;
    const nivel = v.nivelCirugia ?? 0;
    const acumulado = v.acumuladoCirugias;

    const escalas = [
      { nivel: 1, desde: 1000, hasta: 5000, pct: 1.0 },
      { nivel: 2, desde: 5000, hasta: 10000, pct: 1.5 },
      { nivel: 3, desde: 10000, hasta: 15000, pct: 2.5 },
      { nivel: 4, desde: 15000, hasta: 22000, pct: 3.0 },
      { nivel: 5, desde: 22000, hasta: 30000, pct: 3.5 },
      { nivel: 6, desde: 30000, hasta: 40000, pct: 4.0 },
    ];

    const escalaActual = escalas.find(e => e.nivel === nivel);
    const siguienteEscala = escalas.find(e => e.nivel === nivel + 1);
    const faltaParaSiguiente = siguienteEscala ? Math.max(0, siguienteEscala.desde - acumulado) : 0;

    return {
      nivel,
      acumulado,
      pctActual: escalaActual?.pct ?? 0,
      siguienteNivel: siguienteEscala?.nivel ?? null,
      faltaParaSiguiente,
    };
  });

  /* ── Acciones de Usuario ─────────────────────────────────────────────── */

  seleccionarPeriodo(id: string): void {
    this.periodoId.set(id);
  }

  seleccionarVendedora(id: string): void {
    this.vendedoraIdSeleccionada.set(id);
  }

  nombreMes(mes: number): string {
    return MESES[mes - 1] ?? `Mes ${mes}`;
  }

  obtenerIniciales(nombre: string): string {
    if (!nombre) return 'VG';
    const partes = nombre.trim().split(/\s+/);
    if (partes.length >= 2) {
      return (partes[0][0] + partes[1][0]).toUpperCase();
    }
    return (partes[0]?.[0] ?? 'V').toUpperCase();
  }

  obtenerEstadoLabel(estado: string): string {
    return this.estadoLabel[estado as EstadoPeriodo] ?? estado;
  }

  obtenerClasifLabel(clasif: string): string {
    return this.clasifLabel[clasif as ClasifComision] ?? clasif;
  }

  obtenerTipoLabel(tipo: string): string {
    return this.tipoLabel[tipo as TipoComision] ?? tipo;
  }
}
