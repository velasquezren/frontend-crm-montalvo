import { DatePipe } from '@angular/common';
import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import {
  CdkDragDrop,
  DragDropModule,
  moveItemInArray,
  transferArrayItem,
} from '@angular/cdk/drag-drop';

import { mensajeDeError } from '../../core/api/http-error';
import { paginaVacia, RespuestaPaginada } from '../../core/api/pagination.model';
import { generarIniciales } from '../../core/auth/user.model';
import { ToastService } from '../../core/toast/toast.service';
import { AvatarComponent } from '../../shared/components/avatar/avatar.component';
import { BadgeComponent } from '../../shared/components/badge/badge.component';
import { ButtonComponent } from '../../shared/components/button/button.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { FilterChipComponent } from '../../shared/components/filter-chip/filter-chip.component';
import { IconComponent } from '../../shared/components/icon/icon.component';
import { LoadingSkeletonComponent } from '../../shared/components/loading-skeleton/loading-skeleton.component';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { PaginatorComponent } from '../../shared/components/paginator/paginator.component';
import { TableComponent } from '../../shared/components/table/table.component';
import {
  ESTADO_LEAD_BADGE,
  ESTADO_LEAD_LABEL,
  EstadoLead,
} from '../../shared/models/estados.model';
import { Lead, ORIGEN_LABEL, OrigenLeadApi } from './lead.model';
import { FiltroLeads, LeadsService, ResumenLeads } from './leads.service';

type FiltroOrigen = OrigenLeadApi | 'TODOS';

/**
 * Leads — Pipeline Kanban Drag-and-Drop + Vista Tabla.
 * Ref: CRM_MANIFESTO.md §1.2, §3
 */
@Component({
  selector: 'app-leads',
  imports: [
    PageHeaderComponent,
    FilterChipComponent,
    TableComponent,
    AvatarComponent,
    BadgeComponent,
    EmptyStateComponent,
    LoadingSkeletonComponent,
    IconComponent,
    PaginatorComponent,
    DatePipe,
    DragDropModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './leads.page.html',
  styleUrl: './leads.page.css',
})
export class LeadsPage {
  private readonly leadsService = inject(LeadsService);
  private readonly toastService = inject(ToastService);

  protected readonly estadoBadge = ESTADO_LEAD_BADGE;
  protected readonly estadoLabel = ESTADO_LEAD_LABEL;
  protected readonly origenLabel = ORIGEN_LABEL;
  protected readonly iniciales = generarIniciales;

  /* Modos de vista: 'PIPELINE' (Kanban) o 'LISTA' (Tabla) */
  protected readonly modoVista = signal<'PIPELINE' | 'LISTA'>('PIPELINE');
  protected readonly filtro = signal<FiltroOrigen>('TODOS');
  protected readonly pagina = signal(1);

  /**
   * "Importados" es el histórico de FileMaker: 15.000+ pacientes antiguos que
   * no son prospectos por trabajar. El backend los excluye salvo que se pidan,
   * así que el pipeline solo muestra captación real.
   */
  protected readonly filtros: readonly { valor: FiltroOrigen; label: string }[] = [
    { valor: 'TODOS', label: 'Captación activa' },
    { valor: 'PRESENCIAL', label: 'Presencial' },
    { valor: 'WHATSAPP_DIRECTO', label: 'WhatsApp' },
    { valor: 'FACEBOOK_LEAD_AD', label: 'Facebook' },
    { valor: 'INSTAGRAM_LEAD_AD', label: 'Instagram' },
    { valor: 'IMPORTACION', label: 'Histórico importado' },
  ];

  protected readonly viendoHistorico = computed(() => this.filtro() === 'IMPORTACION');

  private filtroActual(): FiltroLeads {
    const f = this.filtro();
    return f === 'TODOS' ? {} : { origen: f };
  }

  /* ── Datos del Servidor ────────────────────────────────────────── */

  /** Conteos reales por columna: la UI no debe contar solo lo que cargó. */
  protected readonly resumen = httpResource<ResumenLeads>(
    () => this.leadsService.resumenRequest(this.filtroActual()),
    {
      defaultValue: {
        porEstado: { NUEVO: 0, CONTACTADO: 0, CONVERTIDO: 0, PERDIDO: 0 },
        totalPipeline: 0,
        historicoImportado: 0,
      },
    },
  );

  /**
   * Kanban: se cargan hasta 100 tarjetas para arrastrar. Si una columna tiene
   * más, la cabecera muestra el total real y se avisa que hay más sin cargar
   * (arrastrar 15.000 tarjetas no es un flujo de trabajo viable).
   */
  protected readonly leads = httpResource<RespuestaPaginada<Lead>>(
    () => {
      const base = this.filtroActual();
      return this.modoVista() === 'PIPELINE'
        ? this.leadsService.listarRequest({ ...base, pagina: 1, limite: 100 })
        : this.leadsService.listarRequest({ ...base, pagina: this.pagina(), limite: 25 });
    },
    { defaultValue: paginaVacia<Lead>() },
  );

  /* ── Estados para columnas del Kanban ──────────────────────────── */
  protected readonly nuevos = signal<Lead[]>([]);
  protected readonly contactados = signal<Lead[]>([]);
  protected readonly convertidos = signal<Lead[]>([]);
  protected readonly perdidos = signal<Lead[]>([]);

  /** Cuántas tarjetas hay sin cargar en cada columna (total real − cargadas). */
  protected ocultasEn(estado: EstadoLead, cargadas: number): number {
    return Math.max(0, this.resumen.value().porEstado[estado] - cargadas);
  }

  constructor() {
    effect(() => {
      const data = this.leads.value().datos;
      this.nuevos.set(data.filter(l => l.estado === 'NUEVO'));
      this.contactados.set(data.filter(l => l.estado === 'CONTACTADO'));
      this.convertidos.set(data.filter(l => l.estado === 'CONVERTIDO'));
      this.perdidos.set(data.filter(l => l.estado === 'PERDIDO'));
    });
  }

  protected cambiarFiltro(valor: FiltroOrigen): void {
    this.filtro.set(valor);
    this.pagina.set(1);
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
      this.leadsService
        .cambiarEstado(item.id, targetColumnId)
        .then(() => {
          this.toastService.success(
            `Lead ${item.cliente.nombre} movido a ${this.estadoLabel[targetColumnId]}`,
            'Pipeline Actualizado',
          );
        })
        .catch((err: unknown) => {
          this.toastService.error(
            mensajeDeError(err, 'Ocurrió un error al actualizar el estado del lead.'),
            'Error al Mover',
          );
          this.leads.reload(); // Revertir cambios
        });
    }
  }
}
