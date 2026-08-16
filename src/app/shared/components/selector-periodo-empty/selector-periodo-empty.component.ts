import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';

import { BadgeComponent } from '../badge/badge.component';
import { ButtonComponent } from '../button/button.component';
import { IconComponent, IconName } from '../icon/icon.component';
import { LoadingSkeletonComponent } from '../loading-skeleton/loading-skeleton.component';
import {
  ESTADO_PERIODO_LABEL,
  MESES,
  PeriodoComision,
} from '../../../features/planilla-comisiones/planilla.model';

/**
 * Componente reutilizable de Estado Vacío para selección de periodos.
 *
 * Se muestra cuando una sección dependiente de un periodo (Liquidación,
 * Analítica, Planes, Reportes) no tiene un mes activo seleccionado.
 *
 * Características:
 * - Acción rápida con 1 solo click para abrir el último periodo disponible.
 * - Grilla visual e interactiva de periodos recientes con sus estados (Calculado, Borrador, Cerrado).
 * - Zona rápida de importación / drag-and-drop de archivos Excel (.xlsx).
 * - Guía paso a paso cuando el sistema no tiene ningún periodo cargado aún.
 */
@Component({
  selector: 'app-selector-periodo-empty',
  imports: [BadgeComponent, ButtonComponent, IconComponent, LoadingSkeletonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './selector-periodo-empty.component.html',
  styleUrl: './selector-periodo-empty.component.css',
})
export class SelectorPeriodoEmptyComponent {
  /* ── Inputs declarativos ─────────────────────────────────────────────── */

  readonly periodos = input<readonly PeriodoComision[]>([]);
  readonly cargando = input<boolean>(false);
  readonly titulo = input<string>('Elige un periodo');
  readonly descripcion = input<string>(
    'Selecciona un mes para revisar y auditar la liquidación, o importa una nueva planilla.',
  );
  readonly icono = input<IconName>('calendar');
  readonly puedeImportar = input<boolean>(false);

  /* ── Outputs de acción ───────────────────────────────────────────────── */

  readonly periodoSeleccionado = output<string>();
  readonly importarClic = output<void>();
  readonly archivoSeleccionado = output<File>();

  /* ── Estado local y diccionarios ─────────────────────────────────────── */

  protected readonly isDragging = signal(false);
  private dragCounter = 0;

  protected readonly estadoLabel = ESTADO_PERIODO_LABEL;
  protected readonly meses = MESES;

  /** El periodo más reciente registrado en el sistema. */
  protected readonly ultimoPeriodo = computed<PeriodoComision | null>(() => {
    const lista = this.periodos();
    return lista.length > 0 ? lista[0] : null;
  });

  /** Lista de periodos secundarios para mostrar en la grilla rápida (excluyendo el primero o los primeros 6). */
  protected readonly periodosRestantes = computed<readonly PeriodoComision[]>(() => {
    const lista = this.periodos();
    return lista.slice(1, 7);
  });

  protected nombreMes(mes: number): string {
    return this.meses[mes - 1] ?? String(mes);
  }

  protected seleccionar(id: string): void {
    this.periodoSeleccionado.emit(id);
  }

  protected onFileChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const archivo = input.files?.[0];
    if (archivo) {
      this.archivoSeleccionado.emit(archivo);
      input.value = '';
    }
  }

  /* ── Drag & Drop ─────────────────────────────────────────────────────── */

  protected onDragEnter(e: DragEvent): void {
    e.preventDefault();
    this.dragCounter++;
    if (this.dragCounter === 1) {
      this.isDragging.set(true);
    }
  }

  protected onDragOver(e: DragEvent): void {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'copy';
    }
  }

  protected onDragLeave(e: DragEvent): void {
    e.preventDefault();
    e.stopPropagation();
    this.dragCounter--;
    if (this.dragCounter <= 0) {
      this.dragCounter = 0;
      this.isDragging.set(false);
    }
  }

  protected onDrop(e: DragEvent): void {
    e.preventDefault();
    e.stopPropagation();
    this.dragCounter = 0;
    this.isDragging.set(false);

    const archivo = e.dataTransfer?.files?.[0];
    if (archivo) {
      this.archivoSeleccionado.emit(archivo);
    }
  }
}
