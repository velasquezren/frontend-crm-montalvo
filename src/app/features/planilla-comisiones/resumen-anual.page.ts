import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { httpResource } from '@angular/common/http';
import { DecimalPipe } from '@angular/common';

import { ErrorCargaComponent } from '../../shared/components/error-carga/error-carga.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { InfoHintComponent } from '../../shared/components/info-hint/info-hint.component';
import { LoadingSkeletonComponent } from '../../shared/components/loading-skeleton/loading-skeleton.component';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { TableComponent } from '../../shared/components/table/table.component';
import { BadgeComponent } from '../../shared/components/badge/badge.component';
import { MonedaPipe } from '../../shared/pipes/moneda.pipe';
import { FilaAnual, MESES_CORTOS, ResumenAnual, TrimestreVendedora } from './planilla.model';
import { PlanillaComisionesService } from './planilla-comisiones.service';

/** Cuántos años atrás se puede mirar desde el selector. */
const ANIOS_HACIA_ATRAS = 4;

/**
 * Resumen anual de comisiones — la única vista que cruza periodos.
 *
 * El resto del módulo trabaja mes a mes, así que para responder "¿esta
 * vendedora venía creciendo?" o "¿por qué cobró bono trimestral en marzo y no
 * en junio?" había que abrir los meses de uno en uno. Es la misma tabla que
 * administración arma aparte en su hoja `CALCULO BONOS`.
 *
 * Dos lecturas en una pantalla: la matriz de doce meses (cómo evolucionó cada
 * una) y los cuatro trimestres con su promedio y su bono (por qué cobró o no).
 */
@Component({
  selector: 'app-resumen-anual',
  imports: [
    DecimalPipe,
    MonedaPipe,
    PageHeaderComponent,
    TableComponent,
    BadgeComponent,
    InfoHintComponent,
    LoadingSkeletonComponent,
    EmptyStateComponent,
    ErrorCargaComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './resumen-anual.page.html',
  styleUrl: './resumen-anual.page.css',
})
export class ResumenAnualPage {
  private readonly planillaService = inject(PlanillaComisionesService);

  protected readonly mesesCortos = MESES_CORTOS;

  protected readonly anio = signal(new Date().getFullYear());

  /** Años ofrecidos en el selector, del actual hacia atrás. */
  protected readonly anios = computed(() => {
    const actual = new Date().getFullYear();
    return Array.from({ length: ANIOS_HACIA_ATRAS + 1 }, (_, i) => actual - i);
  });

  protected readonly resumen = httpResource<ResumenAnual>(
    () => this.planillaService.resumenAnualRequest(this.anio()),
    { defaultValue: { anio: new Date().getFullYear(), filas: [], totalesPorMes: [] } },
  );

  /** Vendedora abierta en el detalle trimestral; null = ninguna. */
  protected readonly expandida = signal<string | null>(null);

  protected alternarDetalle(vendedoraId: string): void {
    this.expandida.update(actual => (actual === vendedoraId ? null : vendedoraId));
  }

  /** Total vendido del año, para el encabezado. */
  protected readonly totalAnual = computed(() =>
    this.resumen.value().filas.reduce((suma, f) => suma + f.totalVendido, 0),
  );

  /** Cuántos meses del año tienen datos: contexto para leer los totales. */
  protected readonly mesesConDatos = computed(
    () => this.resumen.value().totalesPorMes.filter(v => v > 0).length,
  );

  protected cambiarAnio(valor: string): void {
    const n = Number(valor);
    if (Number.isFinite(n)) this.anio.set(n);
  }

  /**
   * Qué contar al lado del promedio de un trimestre incompleto.
   *
   * Un trimestre con uno o dos meses importados NO es comparable con uno de
   * tres: su promedio puede superar el objetivo por tener solo el mejor mes.
   * Se dice explícitamente en vez de mostrar un número que se lee como
   * definitivo.
   */
  protected leyendaTrimestre(t: TrimestreVendedora): string | null {
    if (t.mesesConDatos === 0) return 'sin datos';
    if (t.mesesConDatos < 3) return `parcial · ${t.mesesConDatos} de 3 meses`;
    return null;
  }

  protected esTrimestreCompleto(t: TrimestreVendedora): boolean {
    return t.mesesConDatos === 3;
  }

  /** `track` de la tabla: el id es estable entre recargas. */
  protected idDeFila(_indice: number, fila: FilaAnual): string {
    return fila.vendedoraId;
  }
}
