import { DatePipe } from '@angular/common';
import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';

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
  readonly porcentajeTexto: string;
  readonly tasaPaso: number;
  readonly color: string;
  readonly icon: IconName;
}

export interface CanalConversion {
  readonly origen: string;
  readonly nombre: string;
  readonly nombreCorto: string;
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

const ORIGEN_CORTO: Record<string, string> = {
  WHATSAPP_DIRECTO: 'WhatsApp',
  FACEBOOK_LEAD_AD: 'Facebook',
  FACEBOOK_COMENTARIO: 'FB Coment.',
  FACEBOOK_MENSAJE: 'FB Mensajes',
  INSTAGRAM_LEAD_AD: 'Instagram',
  INSTAGRAM_COMENTARIO: 'IG Coment.',
  INSTAGRAM_MENSAJE: 'IG Mensajes',
  PRESENCIAL: 'Presencial',
  IMPORTACION: 'Histórico',
};

const ORIGEN_COLOR: Record<string, string> = {
  WHATSAPP_DIRECTO: '#0D9488', // Emerald Teal — elegante y ejecutivo
  FACEBOOK_LEAD_AD: '#2563EB', // Royal Blue
  FACEBOOK_COMENTARIO: '#3B82F6',
  FACEBOOK_MENSAJE: '#60A5FA',
  INSTAGRAM_LEAD_AD: '#7C3AED', // Deep Violet
  INSTAGRAM_COMENTARIO: '#8B5CF6',
  INSTAGRAM_MENSAJE: '#A78BFA',
  PRESENCIAL: '#D97706', // Warm Amber
  IMPORTACION: '#64748B', // Slate Grey
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
  private readonly router = inject(Router);

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

    const inclImp = this.incluirImportacion();
    const leadsDigitales = res.leadsPorOrigen
      .filter(l => l.origen !== 'IMPORTACION')
      .reduce((s, l) => s + l.cantidad, 0);

    const totalLeads = res.leadsPorOrigen.reduce((s, l) => s + l.cantidad, 0);
    const baseLeads = inclImp ? totalLeads : (leadsDigitales || totalLeads);

    const convertidos = res.ventas.cantidad || res.leadsPorOrigen.reduce((s, l) => s + l.convertidos, 0);
    const enProceso = res.funnel?.conversacionesTotal ?? 0;
    const citas = res.funnel?.leadsContactados ?? 0;

    const calcPct = (num: number, den: number): { numPct: number; texto: string } => {
      if (!den || den === 0) return { numPct: 0, texto: '0%' };
      const val = (num / den) * 100;
      if (val > 0 && val < 1) return { numPct: Math.max(val, 2), texto: `${val.toFixed(1)}%` };
      const rounded = Math.round(val);
      return { numPct: rounded, texto: `${rounded}%` };
    };

    const p1 = calcPct(baseLeads, baseLeads);
    const p2 = calcPct(enProceso, baseLeads);
    const p3 = calcPct(citas, baseLeads);
    const p4 = calcPct(convertidos, baseLeads);

    const t2 = calcPct(enProceso, baseLeads);
    const t3 = calcPct(citas, enProceso || 1);
    const t4 = calcPct(convertidos, citas || enProceso || 1);

    return [
      {
        id: 'captados',
        label: '1. Leads Captados',
        cantidad: baseLeads,
        porcentaje: p1.numPct,
        porcentajeTexto: p1.texto,
        tasaPaso: 100,
        color: '#006156',
        icon: 'users',
      },
      {
        id: 'contactados',
        label: '2. En Conversación',
        cantidad: enProceso,
        porcentaje: p2.numPct,
        porcentajeTexto: p2.texto,
        tasaPaso: t2.numPct,
        color: '#0D9488',
        icon: 'message-circle',
      },
      {
        id: 'citas',
        label: '3. Citas Agendadas',
        cantidad: citas,
        porcentaje: p3.numPct,
        porcentajeTexto: p3.texto,
        tasaPaso: t3.numPct,
        color: '#2563EB',
        icon: 'calendar',
      },
      {
        id: 'ganados',
        label: '4. Ventas Ganadas',
        cantidad: convertidos,
        porcentaje: p4.numPct,
        porcentajeTexto: p4.texto,
        tasaPaso: t4.numPct,
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
        nombreCorto: ORIGEN_CORTO[l.origen] || l.origen,
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
      if (i === 0) rankBadge = { label: '#1', colorClass: 'bg-amber-100 text-amber-800 border-amber-300' };
      else if (i === 1) rankBadge = { label: '#2', colorClass: 'bg-slate-100 text-slate-700 border-slate-300' };
      else if (i === 2) rankBadge = { label: '#3', colorClass: 'bg-amber-700/10 text-amber-900 border-amber-400/30' };

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

  protected navegarACanal(origen: string): void {
    void this.router.navigate(['/leads'], { queryParams: { origen } });
  }

  protected navegarAEtapa(etapaId: string): void {
    if (etapaId === 'contactados') {
      void this.router.navigate(['/conversaciones']);
    } else if (etapaId === 'ganados') {
      void this.router.navigate(['/ventas']);
    } else {
      void this.router.navigate(['/leads']);
    }
  }

  protected formatearMonto(valor: number): string {
    return formatearBs(valor);
  }
}
