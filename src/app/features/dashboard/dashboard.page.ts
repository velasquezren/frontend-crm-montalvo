import { DatePipe } from '@angular/common';
import { HttpClient, httpResource } from '@angular/common/http';
import { Component, computed, inject } from '@angular/core';

import { API_URL } from '../../core/api/api.constants';
import { AuthService } from '../../core/auth/auth.service';
import { generarIniciales } from '../../core/auth/user.model';
import { AvatarComponent } from '../../shared/components/avatar/avatar.component';
import { BadgeComponent, BadgeVariant } from '../../shared/components/badge/badge.component';
import { CardComponent } from '../../shared/components/card/card.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { IconComponent, IconName } from '../../shared/components/icon/icon.component';
import { LoadingSkeletonComponent } from '../../shared/components/loading-skeleton/loading-skeleton.component';
import { formatearBs, MonedaPipe } from '../../shared/pipes/moneda.pipe';

interface KpiResumen {
  ventas: {
    total: number;
    cantidad: number;
    porAgente: Array<{ agenteId: string; agente: string; cantidad: number; monto: number }>;
  };
  leadsPorOrigen: Array<{ origen: string; cantidad: number; convertidos: number; tasaConversion: number }>;
  clientesPorCategoria: Array<{ categoria: string; cantidad: number }>;
  comisiones: {
    pendiente: number;
    pagada: number;
  };
}

interface KpiCard {
  readonly label: string;
  readonly valor: string;
  readonly icon: IconName;
  readonly tendencia: string;
  readonly tendenciaVariant: BadgeVariant;
  readonly tendenciaIcon: IconName;
}

interface CanalConversion {
  readonly nombre: string;
  readonly leads: number;
  readonly conversion: number;
}

interface AgenteRanking {
  readonly nombre: string;
  readonly iniciales: string;
  readonly ventas: number;
  readonly monto: number;
  readonly porcentaje: number;
}

const ORIGEN_NOMBRE: Record<string, string> = {
  WHATSAPP_DIRECTO: 'WhatsApp Directo',
  FACEBOOK_LEAD_AD: 'Facebook Ads',
  FACEBOOK_COMENTARIO: 'Facebook Comentarios',
  FACEBOOK_MENSAJE: 'Facebook Mensajes',
  INSTAGRAM_LEAD_AD: 'Instagram Ads',
  INSTAGRAM_COMENTARIO: 'Instagram Comentarios',
  INSTAGRAM_MENSAJE: 'Instagram Mensajes',
  PRESENCIAL: 'Ventanilla Presencial',
  IMPORTACION: 'Importación',
};

/**
 * Dashboard — Panel de KPIs y métricas en tiempo real.
 * Ref: RF-16/RF-17/RF-18 y CRM_MANIFESTO.md §4 (átomos compartidos).
 * Conectado a GET /kpis/resumen del backend NestJS.
 */
@Component({
  selector: 'app-dashboard',
  imports: [
    CardComponent,
    BadgeComponent,
    IconComponent,
    AvatarComponent,
    EmptyStateComponent,
    LoadingSkeletonComponent,
  ],
  templateUrl: './dashboard.page.html',
  styleUrl: './dashboard.page.css',
})
export class DashboardPage {
  private readonly authService = inject(AuthService);

  protected readonly firstName = computed(
    () => this.authService.user()?.nombre.split(' ')[0] ?? '',
  );

  protected readonly fechaHoy = new Date().toLocaleDateString('es-BO', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  protected readonly kpiData = httpResource<KpiResumen>(
    () => `${API_URL}/kpis/resumen`,
  );

  protected readonly kpis = computed<KpiCard[]>(() => {
    const res = this.kpiData.value();
    if (!res) return [];

    const totalVentas = res.ventas.total;
    const cantVentas = res.ventas.cantidad;
    const totalLeads = res.leadsPorOrigen.reduce((s, l) => s + l.cantidad, 0);
    const totalConvertidos = res.leadsPorOrigen.reduce((s, l) => s + l.convertidos, 0);
    const tasaGlobal = totalLeads > 0 ? Math.round((totalConvertidos / totalLeads) * 100) : 0;

    return [
      {
        label: 'Ventas Cerradas',
        valor: formatearBs(totalVentas),
        icon: 'shopping-bag',
        tendencia: `${cantVentas} venta${cantVentas === 1 ? '' : 's'}`,
        tendenciaVariant: 'success',
        tendenciaIcon: 'trending-up',
      },
      {
        label: 'Total Leads Captados',
        valor: String(totalLeads),
        icon: 'user-plus',
        tendencia: `${totalConvertidos} convertidos`,
        tendenciaVariant: 'info',
        tendenciaIcon: 'users',
      },
      {
        label: 'Tasa de Conversión',
        valor: `${tasaGlobal}%`,
        icon: 'percent',
        tendencia: 'Leads → Ventas',
        tendenciaVariant: tasaGlobal >= 20 ? 'success' : 'info',
        tendenciaIcon: 'activity',
      },
      {
        label: 'Comisiones Pendientes',
        valor: formatearBs(res.comisiones.pendiente),
        icon: 'wallet',
        tendencia: `Pagadas: ${formatearBs(res.comisiones.pagada)}`,
        tendenciaVariant: res.comisiones.pendiente > 0 ? 'info' : 'neutral',
        tendenciaIcon: 'clock',
      },
    ];
  });

  protected readonly canales = computed<CanalConversion[]>(() => {
    const res = this.kpiData.value();
    if (!res) return [];

    return res.leadsPorOrigen.map(l => ({
      nombre: ORIGEN_NOMBRE[l.origen] || l.origen,
      leads: l.cantidad,
      conversion: l.tasaConversion,
    }));
  });

  protected readonly topAgentes = computed<AgenteRanking[]>(() => {
    const res = this.kpiData.value();
    if (!res || !res.ventas.porAgente.length) return [];

    const maxMonto = Math.max(...res.ventas.porAgente.map(a => a.monto), 1);

    return res.ventas.porAgente.map(a => ({
      nombre: a.agente,
      iniciales: generarIniciales(a.agente),
      ventas: a.cantidad,
      monto: a.monto,
      porcentaje: Math.round((a.monto / maxMonto) * 100),
    }));
  });

  protected formatearMonto(valor: number): string {
    return formatearBs(valor);
  }
}
