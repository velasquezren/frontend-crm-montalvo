import { DatePipe } from '@angular/common';
import { httpResource } from '@angular/common/http';
import { Component, signal } from '@angular/core';

import { API_URL } from '../../core/api/api.constants';
import { generarIniciales } from '../../core/auth/user.model';
import { AvatarComponent } from '../../shared/components/avatar/avatar.component';
import { BadgeComponent, BadgeVariant } from '../../shared/components/badge/badge.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { FilterChipComponent } from '../../shared/components/filter-chip/filter-chip.component';
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
 * Leads — captación multi-canal, datos reales de GET /leads (RF-04/RF-06).
 * Los leads pasan a CONVERTIDO automáticamente cuando el cliente cierra una venta.
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
    DatePipe,
  ],
  templateUrl: './leads.page.html',
})
export class LeadsPage {
  protected readonly estadoBadge = ESTADO_BADGE;
  protected readonly estadoLabel = ESTADO_LABEL;
  protected readonly origenLabel = ORIGEN_LABEL;
  protected readonly iniciales = generarIniciales;

  protected readonly filtro = signal<FiltroOrigen>('TODOS');

  protected readonly filtros: readonly { valor: FiltroOrigen; label: string }[] = [
    { valor: 'TODOS', label: 'Todos' },
    { valor: 'PRESENCIAL', label: 'Presencial' },
    { valor: 'WHATSAPP_DIRECTO', label: 'WhatsApp' },
    { valor: 'FACEBOOK_LEAD_AD', label: 'Facebook' },
    { valor: 'INSTAGRAM_LEAD_AD', label: 'Instagram' },
    { valor: 'IMPORTACION', label: 'Importados' },
  ];

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
}
