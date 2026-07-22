import { DatePipe } from '@angular/common';
import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';

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

export interface CanalConversion {
  readonly origen: string;
  readonly nombre: string;
  readonly leads: number;
  readonly convertidos: number;
  readonly conversion: number;
  readonly color: string;
  readonly porcentajeTotal: number;
  readonly dashArray: string;
  readonly dashOffset: number;
}

interface AgenteRanking {
  readonly nombre: string;
  readonly iniciales: string;
  readonly ventas: number;
  readonly monto: number;
  readonly porcentaje: number;
  readonly rankBadge?: { label: string; colorClass: string };
}

const ORIGEN_NOMBRE: Record<string, string> = {
  WHATSAPP_DIRECTO: 'WhatsApp Directo',
  FACEBOOK_LEAD_AD: 'Facebook Lead Ads',
  FACEBOOK_COMENTARIO: 'Facebook Comentarios',
  FACEBOOK_MENSAJE: 'Facebook Mensajes',
  INSTAGRAM_LEAD_AD: 'Instagram Lead Ads',
  INSTAGRAM_COMENTARIO: 'Instagram Comentarios',
  INSTAGRAM_MENSAJE: 'Instagram Mensajes',
  PRESENCIAL: 'Ventanilla Presencial',
  IMPORTACION: 'Importación Histórica',
};

const ORIGEN_COLOR: Record<string, string> = {
  WHATSAPP_DIRECTO: '#25D366',
  FACEBOOK_LEAD_AD: '#1877F2',
  FACEBOOK_COMENTARIO: '#3B82F6',
  FACEBOOK_MENSAJE: '#60A5FA',
  INSTAGRAM_LEAD_AD: '#E4405F',
  INSTAGRAM_COMENTARIO: '#F472B6',
  INSTAGRAM_MENSAJE: '#FB7185',
  PRESENCIAL: '#8B5CF6',
  IMPORTACION: '#39ADA3',
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

  /* ── Estado de UI del gráfico de canales ────────────────────────── */
  protected readonly vistaGrafico = signal<'DONUT' | 'BARRAS'>('DONUT');
  protected readonly incluirImportacion = signal<boolean>(false);
  protected readonly hoveredCanal = signal<string | null>(null);

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

  /* ── Datos de canales con cálculos Donut SVG ─────────────────────── */
  protected readonly canales = computed<CanalConversion[]>(() => {
    const res = this.kpiData.value();
    if (!res) return [];

    const inclImp = this.incluirImportacion();
    let lista = res.leadsPorOrigen;
    if (!inclImp) {
      lista = lista.filter(l => l.origen !== 'IMPORTACION');
    }

    const totalLeads = lista.reduce((s, l) => s + l.cantidad, 0);
    const C = 2 * Math.PI * 38; // ~238.761 (Radio = 38)
    let accFrac = 0;

    return lista.map(l => {
      const frac = totalLeads > 0 ? l.cantidad / totalLeads : 0;
      const porcentajeTotal = totalLeads > 0 ? Math.round(frac * 100) : 0;
      const strokeLen = (frac * C).toFixed(2);
      const dashArray = `${strokeLen} ${C.toFixed(2)}`;
      const dashOffset = -(accFrac * C);

      accFrac += frac;

      return {
        origen: l.origen,
        nombre: ORIGEN_NOMBRE[l.origen] || l.origen,
        leads: l.cantidad,
        convertidos: l.convertidos,
        conversion: l.tasaConversion,
        color: ORIGEN_COLOR[l.origen] || '#006156',
        porcentajeTotal,
        dashArray,
        dashOffset,
      };
    });
  });

  protected readonly totalLeadsCanales = computed(() =>
    this.canales().reduce((s, c) => s + c.leads, 0),
  );

  protected readonly canalActivoInfo = computed(() => {
    const h = this.hoveredCanal();
    if (!h) return null;
    return this.canales().find(c => c.origen === h) ?? null;
  });

  protected readonly topAgentes = computed<AgenteRanking[]>(() => {
    const res = this.kpiData.value();
    if (!res || !res.ventas.porAgente.length) return [];

    const maxMonto = Math.max(...res.ventas.porAgente.map(a => a.monto), 1);

    return res.ventas.porAgente.map((a, i) => {
      let rankBadge: { label: string; colorClass: string } | undefined;
      if (i === 0) rankBadge = { label: '🥇 1º', colorClass: 'bg-amber-100 text-amber-800 border-amber-300' };
      else if (i === 1) rankBadge = { label: '🥈 2º', colorClass: 'bg-slate-100 text-slate-700 border-slate-300' };
      else if (i === 2) rankBadge = { label: '🥉 3º', colorClass: 'bg-amber-700/10 text-amber-900 border-amber-400/30' };

      return {
        nombre: a.agente,
        iniciales: generarIniciales(a.agente),
        ventas: a.cantidad,
        monto: a.monto,
        porcentaje: Math.round((a.monto / maxMonto) * 100),
        rankBadge,
      };
    });
  });

  protected setVistaGrafico(modo: 'DONUT' | 'BARRAS'): void {
    this.vistaGrafico.set(modo);
  }

  protected toggleIncluirImportacion(): void {
    this.incluirImportacion.update(v => !v);
  }

  protected formatearMonto(valor: number): string {
    return formatearBs(valor);
  }
}
