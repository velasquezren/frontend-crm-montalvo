import { DatePipe } from '@angular/common';
import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import { AuthService } from '../../core/auth/auth.service';
import { generarIniciales } from '../../core/auth/user.model';
import { AvatarComponent } from '../../shared/components/avatar/avatar.component';
import { BadgeComponent, BadgeVariant } from '../../shared/components/badge/badge.component';
import { CardComponent } from '../../shared/components/card/card.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { IconComponent, IconName } from '../../shared/components/icon/icon.component';
import { LoadingSkeletonComponent } from '../../shared/components/loading-skeleton/loading-skeleton.component';
import { formatearBs, MonedaPipe } from '../../shared/pipes/moneda.pipe';
import { KpiResumen } from './kpis.model';
import { KpisService } from './kpis.service';

interface KpiCard {
  readonly label: string;
  readonly valor: string;
  readonly icon: IconName;
  readonly tendencia: string;
  readonly tendenciaVariant: BadgeVariant;
  readonly tendenciaIcon: IconName;
  readonly sparklinePath: string;
}

interface FunnelStage {
  readonly id: string;
  readonly label: string;
  readonly cantidad: number;
  readonly porcentaje: number;
  readonly tasaPaso: number;
  readonly color: string;
  readonly icon: IconName;
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
  changeDetection: ChangeDetectionStrategy.OnPush,
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
  private readonly kpisService = inject(KpisService);

  protected readonly firstName = computed(
    () => this.authService.user()?.nombre.split(' ')[0] ?? '',
  );

  protected readonly fechaHoy = new Date().toLocaleDateString('es-BO', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  protected readonly kpiData = httpResource<KpiResumen>(() =>
    this.kpisService.resumenRequest(),
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
        sparklinePath: 'M0,25 Q15,10 30,18 T60,8 T90,22 T120,4',
      },
      {
        label: 'Total Leads Captados',
        valor: String(totalLeads),
        icon: 'user-plus',
        tendencia: `${totalConvertidos} convertidos`,
        tendenciaVariant: 'info',
        tendenciaIcon: 'users',
        sparklinePath: 'M0,22 Q20,5 40,15 T80,10 T120,3',
      },
      {
        label: 'Tasa de Conversión',
        valor: `${tasaGlobal}%`,
        icon: 'percent',
        tendencia: 'Leads → Ventas',
        tendenciaVariant: tasaGlobal >= 20 ? 'success' : 'info',
        tendenciaIcon: 'activity',
        sparklinePath: 'M0,20 Q15,25 35,12 T75,18 T120,5',
      },
      {
        label: 'Comisiones Pendientes',
        valor: formatearBs(res.comisiones.pendiente),
        icon: 'wallet',
        tendencia: `Pagadas: ${formatearBs(res.comisiones.pagada)}`,
        tendenciaVariant: res.comisiones.pendiente > 0 ? 'info' : 'neutral',
        tendenciaIcon: 'clock',
        sparklinePath: 'M0,15 Q25,28 50,12 T85,20 T120,8',
      },
    ];
  });

  protected readonly funnelData = computed<FunnelStage[]>(() => {
    const res = this.kpiData.value();
    if (!res) return [];

    const totalLeads = res.leadsPorOrigen.reduce((s, l) => s + l.cantidad, 0);
    const convertidos = res.ventas.cantidad || res.leadsPorOrigen.reduce((s, l) => s + l.convertidos, 0);
    const enProceso = res.funnel?.conversacionesTotal ?? 0;
    const citas = res.funnel?.leadsContactados ?? 0;

    const baseLeads = totalLeads || 1;

    return [
      {
        id: 'captados',
        label: '1. Leads Captados',
        cantidad: totalLeads,
        porcentaje: 100,
        tasaPaso: 100,
        color: '#006156',
        icon: 'users',
      },
      {
        id: 'contactados',
        label: '2. En Conversación',
        cantidad: enProceso,
        porcentaje: totalLeads > 0 ? Math.round((enProceso / totalLeads) * 100) : 0,
        tasaPaso: totalLeads > 0 ? Math.round((enProceso / totalLeads) * 100) : 0,
        color: '#39ADA3',
        icon: 'message-circle',
      },
      {
        id: 'citas',
        label: '3. Citas Agendadas',
        cantidad: citas,
        porcentaje: totalLeads > 0 ? Math.round((citas / totalLeads) * 100) : 0,
        tasaPaso: enProceso > 0 ? Math.round((citas / enProceso) * 100) : 0,
        color: '#006156',
        icon: 'calendar',
      },
      {
        id: 'ganados',
        label: '4. Ventas Ganadas',
        cantidad: convertidos,
        porcentaje: totalLeads > 0 ? Math.round((convertidos / totalLeads) * 100) : 0,
        tasaPaso: citas > 0 ? Math.round((convertidos / citas) * 100) : 0,
        color: '#10B981',
        icon: 'check-circle',
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
