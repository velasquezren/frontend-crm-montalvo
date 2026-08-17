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
/**
 * Reparto por canal que acompaña al listado de ventas cuando se filtra por
 * vendedora. `null` si no se filtró: el porcentaje es de una persona.
 */
interface EstadisticasCanal {
  readonly total: number;
  readonly propios: number;
  readonly empresa: number;
  readonly pctPropio: number;
}

/** La página de ventas del mes, con el reparto por canal pegado. */
interface VentasConCanales extends RespuestaPaginada<VentaImportada> {
  readonly canales: EstadisticasCanal | null;
}

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

  protected readonly ventas = httpResource<VentasConCanales>(() => {
    const pId = this.periodoIdEfectivo();
    const vId = this.vendedoraActual()?.vendedoraId;
    if (!pId || !vId) return undefined;
    /* El mes entero, no la primera página: el buscador y los filtros de abajo
       trabajan en memoria sobre esto. Con 100 filas, la vendedora con 418
       ventas tenía 318 invisibles y 9 de sus 61 servicios no se podían
       encontrar — el buscador respondía "no existe" a algo que sí existe.
       Pesa ~16 KB comprimidos en el peor mes que hay en la base. */
    return this.service.ventasRequest(pId, {
      vendedoraId: vId,
      mesCompleto: true,
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

  /**
   * Reparto por canal de la ejecutiva, agregado en el SERVIDOR y traído DENTRO
   * de la respuesta de ventas.
   *
   * Antes se contaba aquí sobre `ventas.value().datos`, que es una página de 100
   * filas y no el mes: medido en producción, 29 de 67 combinaciones
   * vendedora-mes la superan (promedio 117, máximo 423), así que la ejecutiva
   * con 423 ventas veía "100" como total y un porcentaje del último tercio del
   * mes — en la pantalla con la que se la evalúa.
   *
   * Viaja pegado al listado en vez de en su propia petición porque aquí el 97%
   * del tiempo es red: el `groupBy` cuesta milisegundos dentro de la
   * transacción que ya se hacía, y una segunda llamada costaría otro viaje
   * completo cada vez que se cambia de vendedora.
   */
  protected readonly estadisticasCanales = computed(() => this.ventas.value()?.canales ?? null);


  /** Información detallada de bonos y trimestre activo. */
  readonly bonoTrimestralDetalle = computed(() => {
    const p = this.periodoActual();
    const v = this.vendedoraActual();
    if (!p || !v) return null;

    const mes = p.mes;
    const trimestreNum = Math.ceil(mes / 3);
    const esCierre = mes % 3 === 0;
    const nombresTrimestres: Record<number, string> = {
      1: 'Q1 (Ene - Mar)',
      2: 'Q2 (Abr - Jun)',
      3: 'Q3 (Jul - Sep)',
      4: 'Q4 (Oct - Dic)',
    };
    const etiquetaTrimestre = nombresTrimestres[trimestreNum] ?? `Q${trimestreNum}`;

    return {
      mes,
      trimestreNum,
      etiquetaTrimestre,
      esCierre,
      bonoTrimestral: v.bonoTrimestral,
      tieneBono: v.bonoTrimestral > 0,
      bonoJefatura: v.bonoJefatura,
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
        const codigoMatch = this.obtenerCodigoVenta(v).toLowerCase().includes(busq);
        const detalleMatch = v.detalle.toLowerCase().includes(busq);
        const pacienteMatch = (v.paciente ?? '').toLowerCase().includes(busq);
        const clasifMatch = (this.clasifLabel[v.clasif] ?? '').toLowerCase().includes(busq);
        if (!detalleMatch && !pacienteMatch && !clasifMatch && !codigoMatch) return false;
      }
      return true;
    });
  });

  /* ── Acciones de Usuario ─────────────────────────────────────────────── */

  obtenerCodigoVenta(v: VentaImportada): string {
    return v.codOrigen || v.codItem || v.id.slice(0, 8);
  }

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
