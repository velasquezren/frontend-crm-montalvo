import { DatePipe } from '@angular/common';
import { HttpClient, httpResource } from '@angular/common/http';
import { Component, effect, inject, signal } from '@angular/core';
import {
  CdkDragDrop,
  DragDropModule,
  moveItemInArray,
  transferArrayItem,
} from '@angular/cdk/drag-drop';

import { API_URL } from '../../core/api/api.constants';
import { generarIniciales } from '../../core/auth/user.model';
import { ToastService } from '../../core/toast/toast.service';
import { AvatarComponent } from '../../shared/components/avatar/avatar.component';
import { BadgeComponent, BadgeVariant } from '../../shared/components/badge/badge.component';
import { ButtonComponent } from '../../shared/components/button/button.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { FilterChipComponent } from '../../shared/components/filter-chip/filter-chip.component';
import { IconComponent } from '../../shared/components/icon/icon.component';
import { LoadingSkeletonComponent } from '../../shared/components/loading-skeleton/loading-skeleton.component';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { TableComponent } from '../../shared/components/table/table.component';
import { EstadoLead, Lead, ORIGEN_LABEL, OrigenLeadApi } from './lead.model';

type FiltroOrigen = OrigenLeadApi | 'TODOS';

const ESTADO_BADGE: Record<EstadoLead, BadgeVariant> = {
  NUEVO: 'info',
  CONTACTADO: 'neutral',
  CONVERTIDO: 'success',
  PERDIDO: 'critical',
};

const ESTADO_LABEL: Record<EstadoLead, string> = {
  NUEVO: 'Nuevo',
  CONTACTADO: 'Contactado',
  CONVERTIDO: 'Convertido',
  PERDIDO: 'Perdido',
};

/**
 * Leads — Pipeline Kanban Drag-and-Drop + Vista Tabla.
 * Ref: CRM_MANIFESTO.md §1.2, §3
 */
@Component({
  selector: 'app-leads',
  standalone: true,
  imports: [
    PageHeaderComponent,
    FilterChipComponent,
    TableComponent,
    AvatarComponent,
    BadgeComponent,
    EmptyStateComponent,
    LoadingSkeletonComponent,
    IconComponent,
    DatePipe,
    DragDropModule,
  ],
  templateUrl: './leads.page.html',
  styleUrl: './leads.page.css',
})
export class LeadsPage {
  private readonly http = inject(HttpClient);
  private readonly toastService = inject(ToastService);

  protected readonly estadoBadge = ESTADO_BADGE;
  protected readonly estadoLabel = ESTADO_LABEL;
  protected readonly origenLabel = ORIGEN_LABEL;
  protected readonly iniciales = generarIniciales;

  /* Modos de vista: 'PIPELINE' (Kanban) o 'LISTA' (Tabla) */
  protected readonly modoVista = signal<'PIPELINE' | 'LISTA'>('PIPELINE');
  protected readonly filtro = signal<FiltroOrigen>('TODOS');

  protected readonly filtros: readonly { valor: FiltroOrigen; label: string }[] = [
    { valor: 'TODOS', label: 'Todos los canales' },
    { valor: 'PRESENCIAL', label: 'Presencial' },
    { valor: 'WHATSAPP_DIRECTO', label: 'WhatsApp' },
    { valor: 'FACEBOOK_LEAD_AD', label: 'Facebook' },
    { valor: 'INSTAGRAM_LEAD_AD', label: 'Instagram' },
    { valor: 'IMPORTACION', label: 'Importados' },
  ];

  /* ── Datos del Servidor ────────────────────────────────────────── */
  protected readonly leads = httpResource<Lead[]>(
    () => {
      const params: Record<string, string> = {};
      if (this.filtro() !== 'TODOS') {
        params['origen'] = this.filtro();
      }
      return { url: `${API_URL}/leads`, params };
    },
    { defaultValue: [] },
  );

  /* ── Estados para columnas del Kanban ──────────────────────────── */
  protected readonly nuevos = signal<Lead[]>([]);
  protected readonly contactados = signal<Lead[]>([]);
  protected readonly convertidos = signal<Lead[]>([]);
  protected readonly perdidos = signal<Lead[]>([]);

  constructor() {
    effect(() => {
      const data = this.leads.value() ?? [];
      this.nuevos.set(data.filter(l => l.estado === 'NUEVO'));
      this.contactados.set(data.filter(l => l.estado === 'CONTACTADO'));
      this.convertidos.set(data.filter(l => l.estado === 'CONVERTIDO'));
      this.perdidos.set(data.filter(l => l.estado === 'PERDIDO'));
    });
  }

  protected setVista(modo: 'PIPELINE' | 'LISTA'): void {
    this.modoVista.set(modo);
  }

  protected drop(event: CdkDragDrop<Lead[], any, any>): void {
    if (event.previousContainer === event.container) {
      moveItemInArray(event.container.data, event.previousIndex, event.currentIndex);
    } else {
      const item = event.previousContainer.data[event.previousIndex];
      const targetColumnId = event.container.id as EstadoLead;

      // 1. Actualización optimista local
      transferArrayItem(
        event.previousContainer.data,
        event.container.data,
        event.previousIndex,
        event.currentIndex,
      );

      // 2. Persistir en el Backend
      this.http.patch(`${API_URL}/leads/${item.id}/estado`, { estado: targetColumnId }).subscribe({
        next: () => {
          this.toastService.success(
            `Lead ${item.cliente.nombre} movido a ${this.estadoLabel[targetColumnId]}`,
            'Pipeline Actualizado',
          );
        },
        error: () => {
          this.toastService.error(
            'Ocurrió un error al actualizar el estado del lead.',
            'Error al Mover',
          );
          this.leads.reload(); // Revertir cambios
        },
      });
    }
  }
}
