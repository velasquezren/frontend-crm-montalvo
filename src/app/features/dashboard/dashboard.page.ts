import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';

import { AuthService } from '../../core/auth/auth.service';
import { generarIniciales } from '../../core/auth/user.model';
import { AvatarComponent } from '../../shared/components/avatar/avatar.component';
import { BadgeComponent, BadgeVariant } from '../../shared/components/badge/badge.component';
import { ButtonComponent } from '../../shared/components/button/button.component';
import { CardComponent } from '../../shared/components/card/card.component';
import { ChartItem } from '../../shared/components/charts/bar-chart.component';
import { DonutChartComponent } from '../../shared/components/charts/donut-chart.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { ErrorCargaComponent } from '../../shared/components/error-carga/error-carga.component';
import { IconComponent, IconName } from '../../shared/components/icon/icon.component';
import { LoadingSkeletonComponent } from '../../shared/components/loading-skeleton/loading-skeleton.component';
import { MonedaService } from '../../core/moneda/moneda.service';
import { ActividadItem, KpiResumen, TopServicio } from './kpis.model';
import { KpisService } from './kpis.service';

interface KpiCard {
  readonly label: string;
  readonly valor: string;
  readonly icon: IconName;
  readonly tendencia: string;
  readonly tendenciaVariant: BadgeVariant;
  readonly tendenciaIcon: IconName;
  readonly sparklinePath: string;
  readonly tono?: 'primary' | 'secondary' | 'neutral' | 'critical';
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
  readonly leads: number;
  readonly convertidos: number;
  readonly conversion: number;
  readonly color: string;
  readonly porcentajeTotal: number;
}

interface AgenteRanking {
  readonly nombre: string;
  readonly iniciales: string;
  /** Data URL en base64 (~10 KB), o null si el agente nunca subió foto — ver crm-design-system. */
  readonly foto: string | null;
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
  WHATSAPP_DIRECTO: '#006156', // Teal Montalvo
  FACEBOOK_LEAD_AD: '#1D4ED8', // Royal Blue
  FACEBOOK_COMENTARIO: '#3B82F6',
  FACEBOOK_MENSAJE: '#60A5FA',
  INSTAGRAM_LEAD_AD: '#6D28D9', // Deep Violet
  INSTAGRAM_COMENTARIO: '#8B5CF6',
  INSTAGRAM_MENSAJE: '#A78BFA',
  PRESENCIAL: '#D97706', // Warm Amber
  IMPORTACION: '#64748B', // Slate Grey
};

/**
 * Dashboard — Panel Operativo y Comercial en Tiempo Real.
 * Ref: CRM_MANIFESTO.md §4 (átomos compartidos).
 * Conectado a GET /kpis/resumen del backend NestJS.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-dashboard',
  imports: [
    CardComponent,
    BadgeComponent,
    ButtonComponent,
    DonutChartComponent,
    IconComponent,
    AvatarComponent,
    EmptyStateComponent,
    ErrorCargaComponent,
    LoadingSkeletonComponent,
  ],
  templateUrl: './dashboard.page.html',
  styleUrl: './dashboard.page.css',
})
export class DashboardPage {
  /* Los KPI se formatean con el servicio y no con `formatearBs`, que imprimía
     siempre "Bs": leer aquí la señal de moneda hace que este computed se
     recalcule al pulsar el selector, y así las tarjetas dejan de contradecir a
     la tabla que tienen debajo. */
  private readonly moneda = inject(MonedaService);

  private readonly authService = inject(AuthService);
  private readonly kpisService = inject(KpisService);
  private readonly router = inject(Router);

  /* ── Estado de UI del gráfico de canales ────────────────────────── */
  protected readonly vistaGrafico = signal<'DONUT' | 'BARRAS'>('DONUT');
  protected readonly incluirImportacion = signal<boolean>(false);

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

    const pulso = res.pulsoHoy;
    const totalVentas = res.ventas.total;
    const cantVentas = res.ventas.cantidad;
    const ticketProm = res.ventas.ticketPromedio ?? (cantVentas > 0 ? Math.round(totalVentas / cantVentas) : 0);

    const leadsHoy = pulso?.leadsHoy ?? 0;
    const ventasHoyMonto = pulso?.ventasHoyMonto ?? 0;
    const ventasHoyCant = pulso?.ventasHoyCantidad ?? 0;
    const pendientesAtencion = pulso?.leadsNuevosSinAtender ?? 0;

    const totalLeads = res.leadsPorOrigen.reduce((s, l) => s + l.cantidad, 0);
    const totalConvertidos = res.leadsPorOrigen.reduce((s, l) => s + l.convertidos, 0);
    const tasaGlobal = totalLeads > 0 ? Math.round((totalConvertidos / totalLeads) * 100) : 0;

    return [
      {
        label: 'Ventas Cerradas (Periodo)',
        valor: this.moneda.formatearBob(totalVentas),
        icon: 'wallet',
        tendencia: `${cantVentas} ventas · Ticket: ${this.moneda.formatearBob(ticketProm)}`,
        tendenciaVariant: 'success',
        tendenciaIcon: 'trending-up',
        sparklinePath: 'M0,25 Q15,10 30,18 T60,8 T90,22 T120,4',
        tono: 'primary',
      },
      {
        label: 'Ventas de Hoy',
        valor: this.moneda.formatearBob(ventasHoyMonto),
        icon: 'shopping-bag',
        tendencia: `${ventasHoyCant} cerradas hoy`,
        tendenciaVariant: ventasHoyCant > 0 ? 'success' : 'neutral',
        tendenciaIcon: 'check-circle',
        sparklinePath: 'M0,22 Q20,15 40,20 T80,8 T120,2',
      },
      {
        label: 'Nuevos Leads de Hoy',
        valor: String(leadsHoy),
        icon: 'user-plus',
        tendencia: `${pendientesAtencion} por contactar`,
        tendenciaVariant: pendientesAtencion > 0 ? 'info' : 'neutral',
        tendenciaIcon: 'users',
        sparklinePath: 'M0,20 Q15,25 35,12 T75,18 T120,5',
      },
      {
        label: 'Efectividad Comercial',
        valor: `${tasaGlobal}%`,
        icon: 'activity',
        tendencia: `${totalConvertidos} pacientes convertidos`,
        tendenciaVariant: tasaGlobal >= 15 ? 'success' : 'info',
        tendenciaIcon: 'trending-up',
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

    return lista.map(l => ({
      origen: l.origen,
      nombre: ORIGEN_NOMBRE[l.origen] || l.origen,
      leads: l.cantidad,
      convertidos: l.convertidos,
      conversion: l.tasaConversion,
      color: ORIGEN_COLOR[l.origen] || '#006156',
      porcentajeTotal: totalLeads > 0 ? Math.round((l.cantidad / totalLeads) * 100) : 0,
    }));
  });

  protected readonly totalLeadsCanales = computed(() =>
    this.canales().reduce((s, c) => s + c.leads, 0),
  );

  /**
   * Los mismos canales, en la forma que consume `<app-donut-chart>`.
   * `id: origen` es la clave real de negocio; `label: nombre` es lo que se
   * lee — segmentClick emite la primera, nunca el nombre traducido.
   */
  protected readonly canalesChartItems = computed<ChartItem[]>(() =>
    this.canales().map(c => ({
      id: c.origen,
      label: c.nombre,
      value: c.leads,
      color: c.color,
      sublabel: `${c.conversion}% conversión`,
    })),
  );

  protected readonly topAgentes = computed<AgenteRanking[]>(() => {
    const res = this.kpiData.value();
    if (!res || !res.ventas.porAgente.length) return [];

    const maxMonto = Math.max(...res.ventas.porAgente.map(a => a.monto), 1);

    return res.ventas.porAgente.map((a, i) => {
      /* Medallero 1-2-3 con la paleta cerrada: nada de oro/plata/bronce
         (ámbar/gris) — CRM_MANIFESTO.md §3.4 los excluye a propósito. La
         jerarquía se lee por intensidad del mismo verde de marca: sólido,
         sólido secundario, y suave. */
      let rankBadge: { label: string; colorClass: string } | undefined;
      if (i === 0) rankBadge = { label: '#1', colorClass: 'bg-primary text-white border-primary' };
      else if (i === 1) rankBadge = { label: '#2', colorClass: 'bg-secondary text-white border-secondary' };
      else if (i === 2) rankBadge = { label: '#3', colorClass: 'bg-primary/10 text-primary border-primary/30' };

      return {
        nombre: a.agente,
        iniciales: generarIniciales(a.agente),
        foto: a.foto,
        ventas: a.cantidad,
        monto: a.monto,
        porcentaje: Math.round((a.monto / maxMonto) * 100),
        rankBadge,
      };
    });
  });

  protected readonly topServicios = computed<TopServicio[]>(() => {
    return this.kpiData.value()?.topServicios ?? [];
  });

  protected readonly actividadReciente = computed<ActividadItem[]>(() => {
    return this.kpiData.value()?.actividadReciente ?? [];
  });

  protected formatearHoraRelativa(fechaIso: string): string {
    const fecha = new Date(fechaIso);
    const ahora = new Date();
    const diffMs = ahora.getTime() - fecha.getTime();
    const diffMin = Math.floor(diffMs / 60000);

    if (diffMin < 1) return 'Hace un momento';
    if (diffMin < 60) return `Hace ${diffMin} min`;
    const diffHoras = Math.floor(diffMin / 60);
    if (diffHoras < 24) return `Hoy, ${fecha.toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' })}`;
    return fecha.toLocaleDateString('es-BO', { day: '2-digit', month: 'short' });
  }

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

  protected navegarActividad(item: ActividadItem): void {
    if (item.tipo === 'VENTA') {
      void this.router.navigate(['/ventas']);
    } else {
      void this.router.navigate(['/leads']);
    }
  }

  protected formatearMonto(valor: number): string {
    return this.moneda.formatearBob(valor);
  }
}
