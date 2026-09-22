import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { AuthService } from '../../core/auth/auth.service';
import { generarIniciales } from '../../core/auth/user.model';
import { MonedaService } from '../../core/moneda/moneda.service';
import { AvatarComponent } from '../../shared/components/avatar/avatar.component';
import { BadgeComponent, BadgeVariant } from '../../shared/components/badge/badge.component';
import { ButtonComponent } from '../../shared/components/button/button.component';
import { CardComponent } from '../../shared/components/card/card.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { ErrorCargaComponent } from '../../shared/components/error-carga/error-carga.component';
import { IconComponent, IconName } from '../../shared/components/icon/icon.component';
import { InfoHintComponent } from '../../shared/components/info-hint/info-hint.component';
import { LoadingSkeletonComponent } from '../../shared/components/loading-skeleton/loading-skeleton.component';
import { SparklineComponent } from '../../shared/components/sparkline/sparkline.component';
import { NombreClientePipe } from '../../shared/pipes/nombre-cliente.pipe';
import { ORIGEN_LABEL } from '../leads/lead.model';
import { ActividadItem, formatearEspera, KpiResumen, PeriodoKpi, porcentaje, variacion } from './kpis.model';
import { KpisService } from './kpis.service';

const PERIODOS: ReadonlyArray<{ clave: PeriodoKpi; label: string; comparado: string; corto: string }> = [
  { clave: 'MES', label: 'Este mes', comparado: 'el mes pasado a esta altura', corto: 'vs. mes pasado' },
  { clave: 'MES_ANTERIOR', label: 'Mes anterior', comparado: 'el mes previo', corto: 'vs. mes previo' },
  { clave: 'TRES_MESES', label: '3 meses', comparado: 'los tres meses previos', corto: 'vs. trimestre previo' },
];

/** Una tarjeta de indicador: el estilo de siempre, con su línea sacada de los datos. */
interface Tarjeta {
  readonly label: string;
  readonly valor: string;
  readonly icon: IconName;
  readonly badge: { readonly texto: string; readonly variant: BadgeVariant; readonly icon: IconName };
  readonly detalle: string;
  readonly serie: ReadonlyArray<number | null>;
}

/**
 * Dashboard — lo que hay que atender ahora y cómo va el periodo.
 *
 * Dos reglas de esta vista, las dos aprendidas de su versión anterior:
 *
 * 1. **Cada número dice de qué periodo es.** Antes, «25 leads de hoy» llevaba
 *    debajo «632 por contactar», que eran todos los leads en NUEVO desde julio.
 *    Leído junto, parecía que hoy habían entrado 25 y faltaban 632.
 * 2. **Nada inventado.** Las mini-gráficas eran trazos fijos escritos a mano,
 *    la etapa «Citas» contaba leads CONTACTADO (el CRM no agenda citas) y el
 *    distintivo «Tiempo real» no lo era. Lo que se dibuja sale de los datos.
 *
 * Los canales se distinguen por su NOMBRE, en una tabla, no por color: con
 * nueve orígenes y una paleta de tres tonos, el color obligaba a inventar
 * hexadecimales de marca ajena (era la única deuda de paleta del proyecto).
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-dashboard',
  imports: [
    RouterLink,
    AvatarComponent,
    BadgeComponent,
    ButtonComponent,
    CardComponent,
    EmptyStateComponent,
    ErrorCargaComponent,
    IconComponent,
    InfoHintComponent,
    LoadingSkeletonComponent,
    NombreClientePipe,
    SparklineComponent,
  ],
  templateUrl: './dashboard.page.html',
  styleUrl: './dashboard.page.css',
})
export class DashboardPage {
  /* Leer la señal de moneda dentro de los computed hace que los montos se
     recalculen al pulsar Bs/USD en la barra superior. */
  private readonly moneda = inject(MonedaService);
  private readonly authService = inject(AuthService);
  private readonly kpisService = inject(KpisService);
  private readonly router = inject(Router);

  protected readonly periodos = PERIODOS;
  protected readonly periodo = signal<PeriodoKpi>('MES');
  protected readonly origenLabel = ORIGEN_LABEL;
  protected readonly espera = formatearEspera;
  protected readonly pct = porcentaje;

  protected readonly firstName = computed(() => this.authService.user()?.nombre.split(' ')[0] ?? '');
  protected readonly fechaHoy = new Date().toLocaleDateString('es-BO', { weekday: 'long', day: 'numeric', month: 'long' });

  protected readonly kpiData = httpResource<KpiResumen>(() =>
    this.kpisService.resumenRequest(this.periodo()),
  );

  /** Hora de la última respuesta: sustituye al «Tiempo real», que no lo era. */
  protected readonly actualizadoA = computed(() => {
    if (!this.kpiData.value()) return '';
    return new Date().toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' });
  });

  private readonly periodoActual = computed(() => PERIODOS.find(p => p.clave === this.periodo()) ?? PERIODOS[0]);

  protected readonly tarjetas = computed<Tarjeta[]>(() => {
    const r = this.kpiData.value();
    if (!r) return [];
    const { embudo, ventas, serie } = r;
    const { comparado, corto } = this.periodoActual();
    const vsLeads = variacion(embudo.captados, embudo.anterior.captados);
    const vsVentas = variacion(ventas.total, ventas.anterior.total);
    const tasa = porcentaje(embudo.respondidos, embudo.captados);
    const rapido = porcentaje(embudo.respondidosEnUnaHora, embudo.captados);
    const sinRespuesta = embudo.captados - embudo.respondidos;
    const cambio = (v: ReturnType<typeof variacion>) => (v ? `${v.corto} ${corto}` : '');

    return [
      {
        label: 'Leads captados',
        valor: embudo.captados.toLocaleString('es-BO'),
        icon: 'user-plus',
        badge: vsLeads
          ? { texto: cambio(vsLeads), variant: vsLeads.sube ? 'success' : 'neutral', icon: 'trending-up' }
          : { texto: `${r.ahora.leadsHoy} hoy`, variant: 'info', icon: 'users' },
        detalle: vsLeads ? `${vsLeads.texto} ${comparado}` : 'Sin periodo anterior con qué comparar',
        serie: serie.map(p => p.captados),
      },
      {
        label: 'Respondidos por el equipo',
        valor: tasa === null ? '—' : `${tasa} %`,
        icon: 'message-circle',
        badge: sinRespuesta > 0
          ? { texto: `${sinRespuesta} sin respuesta`, variant: 'info', icon: 'alert-circle' }
          : { texto: 'Todos respondidos', variant: 'success', icon: 'check-circle' },
        detalle: embudo.captados ? `${embudo.respondidos} de ${embudo.captados} leads` : 'Sin leads en el periodo',
        serie: serie.map(p => porcentaje(p.respondidos, p.captados)),
      },
      {
        label: 'Primera respuesta',
        valor: formatearEspera(embudo.medianaRespuestaMinutos),
        icon: 'clock',
        badge: { texto: rapido === null ? 'Sin datos' : `${rapido} % en 1 h`, variant: 'info', icon: 'activity' },
        detalle: 'Mediana: la mitad se respondió en menos',
        serie: serie.map(p => p.medianaMinutos),
      },
      {
        label: 'Ventas',
        valor: this.moneda.formatearBob(ventas.total),
        icon: 'wallet',
        badge: {
          texto: `${ventas.cantidad} ${ventas.cantidad === 1 ? 'venta' : 'ventas'}`,
          variant: ventas.cantidad > 0 ? 'success' : 'neutral',
          icon: 'check-circle',
        },
        detalle: ventas.cantidad
          ? `Ticket ${this.moneda.formatearBob(ventas.ticketPromedio)}${vsVentas ? ` · ${cambio(vsVentas)}` : ''}`
          : 'Sin ventas registradas en el periodo',
        serie: serie.map(p => p.ventas),
      },
    ];
  });

  /**
   * Barras de la serie, en proporción al día con más leads. Cada barra se
   * parte en respondidos (sólido) y sin respuesta (suave): así se ve de un
   * vistazo QUÉ días quedaron gente sin atender, no solo cuántos entraron.
   */
  protected readonly serie = computed(() => {
    const r = this.kpiData.value();
    if (!r) return null;
    const max = Math.max(...r.serie.map(p => p.captados), 1);
    const semanal = r.periodo.granularidad === 'SEMANA';
    const etiqueta = (iso: string) =>
      new Date(`${iso}T12:00:00Z`).toLocaleDateString('es-BO', { day: 'numeric', month: 'short', timeZone: 'UTC' });
    const barras = r.serie.map(p => ({
      fecha: p.fecha,
      alto: (p.captados / max) * 100,
      respondidos: p.captados ? (p.respondidos / p.captados) * 100 : 0,
      titulo: `${semanal ? 'Semana del ' : ''}${etiqueta(p.fecha)}: ${p.captados} leads, ${p.respondidos} respondidos`,
    }));
    const mitad = r.serie[Math.floor(r.serie.length / 2)];
    return {
      barras,
      max,
      ejes: r.serie.length ? [etiqueta(r.serie[0].fecha), mitad ? etiqueta(mitad.fecha) : '', etiqueta(r.serie[r.serie.length - 1].fecha)] : [],
      unidad: semanal ? 'por semana' : 'por día',
      hayDatos: r.serie.some(p => p.captados > 0),
    };
  });

  protected readonly embudo = computed(() => {
    const e = this.kpiData.value()?.embudo;
    if (!e) return [];
    return [
      { etapa: 'Captados', cantidad: e.captados, ancho: e.captados ? 100 : 0, nota: 'leads que entraron en el periodo' },
      {
        etapa: 'Respondidos',
        cantidad: e.respondidos,
        ancho: porcentaje(e.respondidos, e.captados) ?? 0,
        nota: `${porcentaje(e.respondidos, e.captados) ?? 0} % de los captados`,
      },
      {
        etapa: 'Con venta',
        cantidad: e.convertidos,
        ancho: porcentaje(e.convertidos, e.captados) ?? 0,
        nota: `${porcentaje(e.convertidos, e.respondidos) ?? 0} % de los respondidos`,
      },
    ];
  });

  protected readonly canales = computed(() => {
    const r = this.kpiData.value();
    if (!r) return [];
    const max = Math.max(...r.canales.map(c => c.captados), 1);
    return r.canales.map(c => ({ ...c, ancho: (c.captados / max) * 100 }));
  });

  protected readonly equipo = computed(() => {
    const agentes = this.kpiData.value()?.ventas.porAgente ?? [];
    const max = Math.max(...agentes.map(a => a.monto), 1);
    return agentes.map((a, i) => ({
      ...a,
      iniciales: generarIniciales(a.agente),
      ancho: (a.monto / max) * 100,
      monto: this.moneda.formatearBob(a.monto),
      puesto: i + 1,
    }));
  });

  protected readonly servicios = computed(() =>
    (this.kpiData.value()?.topServicios ?? []).map(s => ({ ...s, monto: this.moneda.formatearBob(s.monto) })),
  );

  protected readonly actividad = computed(() =>
    (this.kpiData.value()?.actividadReciente ?? []).map(a => ({
      ...a,
      que: a.tipo === 'VENTA' ? a.detalle : `Lead · ${ORIGEN_LABEL[a.detalle as keyof typeof ORIGEN_LABEL] ?? a.detalle}`,
      monto: a.monto > 0 ? this.moneda.formatearBob(a.monto) : '',
      cuando: cuando(a.fecha),
    })),
  );

  protected irACanal(origen: string): void {
    void this.router.navigate(['/leads'], { queryParams: { origen } });
  }

  protected irAActividad(item: Pick<ActividadItem, 'tipo'>): void {
    void this.router.navigate([item.tipo === 'VENTA' ? '/ventas' : '/leads']);
  }
}

/** «hace 5 min», «14:32», «18 sep». */
function cuando(iso: string): string {
  const fecha = new Date(iso);
  const minutos = Math.floor((Date.now() - fecha.getTime()) / 60_000);
  if (minutos < 1) return 'ahora';
  if (minutos < 60) return `hace ${minutos} min`;
  if (fecha.toDateString() === new Date().toDateString()) {
    return fecha.toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' });
  }
  return fecha.toLocaleDateString('es-BO', { day: 'numeric', month: 'short' });
}
