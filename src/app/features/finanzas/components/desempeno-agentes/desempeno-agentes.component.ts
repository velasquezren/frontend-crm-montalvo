import { DatePipe, DecimalPipe } from '@angular/common';
import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';

import { RespuestaPaginada } from '../../../../core/api/pagination.model';
import { AvatarComponent } from '../../../../shared/components/avatar/avatar.component';
import { BadgeComponent } from '../../../../shared/components/badge/badge.component';
import { EmptyStateComponent } from '../../../../shared/components/empty-state/empty-state.component';
import { FilterChipComponent } from '../../../../shared/components/filter-chip/filter-chip.component';
import { IconComponent } from '../../../../shared/components/icon/icon.component';
import { InputComponent } from '../../../../shared/components/input/input.component';
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
 * Diseño minimalista de alta densidad con:
 * - Selector fluido con FilterChip de diseño atómico.
 * - Termómetro limpio de metas y tramos de cirugía.
 * - Desglose transparente de haberes contables del mes.
 * - Buscador y filtros de ventas registradas.
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
    FilterChipComponent,
    InputComponent,
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
  readonly busquedaVentas = signal<string>('');
  readonly filtroCanal = signal<'TODOS' | 'EMPRESA' | 'PROPIO'>('TODOS');

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
    const vId = this.vendedoraActual()?.vendedoraId;
    if (!pId || !vId) return undefined;
    return this.service.ventasRequest(pId, {
      vendedoraId: vId,
      limite: 200,
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

  /** Estadísticas de efectividad de canales de la ejecutiva. */
  readonly estadisticasCanales = computed(() => {
    const lista = this.ventas.value()?.datos ?? [];
    if (lista.length === 0) return { total: 0, propios: 0, empresa: 0, pctPropio: 0 };
    const propios = lista.filter(v => v.canal === 'PROPIO').length;
    const empresa = lista.length - propios;
    const pctPropio = Math.round((propios / lista.length) * 100);
    return {
      total: lista.length,
      propios,
      empresa,
      pctPropio,
    };
  });

  /** Ventas filtradas reactivamente por búsqueda y canal. */
  readonly ventasFiltradas = computed<VentaImportada[]>(() => {
    const lista = this.ventas.value()?.datos ?? [];
    const busq = this.busquedaVentas().trim().toLowerCase();
    const canal = this.filtroCanal();

    return lista.filter(v => {
      if (canal !== 'TODOS' && v.canal !== canal) return false;
      if (busq) {
        const detalleMatch = v.detalle.toLowerCase().includes(busq);
        const pacienteMatch = (v.paciente ?? '').toLowerCase().includes(busq);
        const clasifMatch = (this.clasifLabel[v.clasif] ?? '').toLowerCase().includes(busq);
        if (!detalleMatch && !pacienteMatch && !clasifMatch) return false;
      }
      return true;
    });
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
