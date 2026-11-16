import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, linkedSignal, signal } from '@angular/core';
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
import { LoadingSkeletonComponent } from '../../shared/components/loading-skeleton/loading-skeleton.component';
import { SparklineComponent } from '../../shared/components/sparkline/sparkline.component';
import { NombreClientePipe } from '../../shared/pipes/nombre-cliente.pipe';
import { ORIGEN_LABEL } from '../leads/lead.model';
import { enlaceAlChat } from '../conversaciones/enlace-chat';
import { DashAnalisisComponent } from './components/dash-analisis/dash-analisis.component';
import { DashVentasComponent } from './components/dash-ventas/dash-ventas.component';
import { ActividadItem, inicioReciente, KpiResumen, PeriodoKpi, porcentaje, variacion } from './kpis.model';
import { KpisService } from './kpis.service';

/**
 * Cada cuánto se actualiza solo con la pestaña a la vista. Recepción lo deja
 * abierto todo el día: sin esto, los números, la fecha y el «hace 5 min» eran
 * los de la hora en que se abrió (20/10/2026). `/kpis/resumen` tarda ~40 ms.
 */
const REFRESCO_MS = 5 * 60_000;
/** Al volver a la pestaña, solo si lo que se ve tiene más de esto. */
const VIEJO_AL_VOLVER_MS = 60_000;

/** Durante cuántos días «Este mes» avisa que todavía tiene pocos datos. */
const DIAS_MES_RECIEN_EMPEZADO = 3;

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
  /** La línea del pie, día a día. Sin ella, la tarjeta lleva `barra`. */
  readonly serie?: ReadonlyArray<number | null>;
  /** Una proporción (0 a 100) en el pie, para lo que no tiene serie diaria. */
  readonly barra?: number;
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
    DashAnalisisComponent,
    DashVentasComponent,
    EmptyStateComponent,
    ErrorCargaComponent,
    IconComponent,
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

  protected readonly firstName = computed(() => this.authService.user()?.nombre.split(' ')[0] ?? '');
  /** El reloj de la vista: avanza con cada actualización, así la fecha no se queda en ayer. */
  private readonly ahora = signal(Date.now());
  protected readonly fechaHoy = computed(() =>
    new Date(this.ahora()).toLocaleDateString('es-BO', { weekday: 'long', day: 'numeric', month: 'long' }),
  );

  protected readonly kpiData = httpResource<KpiResumen>(() =>
    this.kpisService.resumenRequest(this.periodo()),
  );

  /** Hora de la última respuesta: sustituye al «Tiempo real», que no lo era. */
  /**
   * Los últimos indicadores que llegaron, aunque se esté pidiendo otro periodo.
   *
   * Al cambiar de periodo `httpResource` se queda sin valor mientras carga, y el
   * panel entero se cambiaba por esqueletos de otra altura: la página saltaba
   * dos veces por clic. Ahora lo anterior se queda, atenuado, hasta que llega
   * lo nuevo.
   */
  protected readonly datos = linkedSignal<KpiResumen | undefined, KpiResumen | undefined>({
    /* `value()` lanza con el recurso en error: se pregunta antes. */
    source: () => (this.kpiData.hasValue() ? this.kpiData.value() : undefined),
    computation: (nuevo, previo) => nuevo ?? previo?.value,
  });

  /** Hay datos a la vista pero se está pidiendo otro periodo. */
  protected readonly recargando = computed(() => this.kpiData.isLoading() && !!this.datos());

  protected readonly actualizadoA = computed(() => {
    if (!this.kpiData.hasValue()) return '';
    return new Date(this.ahora()).toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' });
  });

  constructor() {
    const actualizar = () => {
      this.ahora.set(Date.now());
      this.kpiData.reload();
    };
    const intervalo = setInterval(() => {
      if (!document.hidden) actualizar();
    }, REFRESCO_MS);
    const alVolver = () => {
      if (!document.hidden && Date.now() - this.ahora() > VIEJO_AL_VOLVER_MS) actualizar();
    };
    document.addEventListener('visibilitychange', alVolver);
    inject(DestroyRef).onDestroy(() => {
      clearInterval(intervalo);
      document.removeEventListener('visibilitychange', alVolver);
    });
  }

  private readonly periodoActual = computed(() => PERIODOS.find(p => p.clave === this.periodo()) ?? PERIODOS[0]);

  /**
   * «Este mes» los primeros días: cuánto lleva, o null si ya no hace falta
   * decirlo. El 1 a las 00:09 el mes tenía nueve minutos y todo salía en cero
   * —también la comparación, que es «el mes pasado a esta altura»—, y se leyó
   * como que el Dashboard no traía datos.
   */
  protected readonly mesRecienEmpezado = computed(() => {
    const r = this.datos();
    return this.periodo() === 'MES' && r ? inicioReciente(r.periodo.desde, new Date(), DIAS_MES_RECIEN_EMPEZADO) : null;
  });

  /**
   * Tres números del periodo: cuántos entraron, cuántos compraron y cuánto se
   * vendió. Hasta el 16/11/2026 había dos más —«Respondidos por el equipo» y
   * «Primera respuesta»— que René pidió quitar: el retraso es de recepción y
   * el Dashboard lo hacía parecer una falla del CRM. Lo pendiente sigue en
   * Conversaciones y en la franja «Pendiente ahora».
   */
  protected readonly tarjetas = computed<Tarjeta[]>(() => {
    const r = this.datos();
    if (!r) return [];
    const { embudo, ventas, serie } = r;
    const { comparado, corto } = this.periodoActual();
    const vsLeads = variacion(embudo.captados, embudo.anterior.captados);
    const vsVentas = variacion(ventas.total, ventas.anterior.total);
    const tasa = porcentaje(embudo.convertidos, embudo.captados);
    const tasaAnterior = porcentaje(embudo.anterior.convertidos, embudo.anterior.captados);
    const puntos = tasa !== null && tasaAnterior !== null ? tasa - tasaAnterior : null;
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
        label: 'Leads que compraron',
        valor: tasa === null ? '—' : `${tasa} %`,
        icon: 'percent',
        badge: puntos === null
          ? { texto: `${embudo.convertidos} con venta`, variant: 'info', icon: 'check-circle' }
          : {
              texto: `${puntos > 0 ? '+' : puntos < 0 ? '−' : ''}${Math.abs(puntos)} pts ${corto}`,
              variant: puntos >= 0 ? 'success' : 'neutral',
              icon: 'trending-up',
            },
        detalle: embudo.captados
          ? `${embudo.convertidos} de ${embudo.captados} leads con una venta registrada`
          : 'Sin leads en el periodo',
        barra: tasa ?? 0,
      },
      {
        label: 'Ventas',
        valor: this.moneda.formatearBob(ventas.total),
        icon: 'wallet',
        badge: vsVentas
          ? { texto: cambio(vsVentas), variant: vsVentas.sube ? 'success' : 'neutral', icon: 'trending-up' }
          : { texto: `${ventas.cantidad} ${ventas.cantidad === 1 ? 'venta' : 'ventas'}`, variant: ventas.cantidad > 0 ? 'success' : 'neutral', icon: 'check-circle' },
        detalle: ventas.cantidad
          ? `${ventas.cantidad} ${ventas.cantidad === 1 ? 'venta' : 'ventas'} · ticket ${this.moneda.formatearBob(ventas.ticketPromedio)}`
          : 'Sin ventas registradas en el periodo',
        serie: serie.map(p => p.ventas),
      },
    ];
  });

  protected readonly canales = computed(() => {
    const r = this.datos();
    if (!r) return [];
    const max = Math.max(...r.canales.map(c => c.captados), 1);
    return r.canales.map(c => ({ ...c, ancho: (c.captados / max) * 100, conversion: porcentaje(c.convertidos, c.captados) }));
  });

  protected readonly equipo = computed(() => {
    const agentes = this.datos()?.ventas.porAgente ?? [];
    const max = Math.max(...agentes.map(a => a.monto), 1);
    return agentes.map((a, i) => ({
      ...a,
      iniciales: generarIniciales(a.agente),
      ancho: (a.monto / max) * 100,
      monto: this.moneda.formatearBob(a.monto),
      puesto: i + 1,
    }));
  });

  protected readonly actividad = computed(() => {
    const ahora = this.ahora();
    return (this.datos()?.actividadReciente ?? []).map(a => ({
      ...a,
      que: a.tipo === 'VENTA' ? a.detalle : `Lead · ${ORIGEN_LABEL[a.detalle as keyof typeof ORIGEN_LABEL] ?? a.detalle}`,
      monto: a.monto > 0 ? this.moneda.formatearBob(a.monto) : '',
      cuando: cuando(a.fecha, ahora),
    }));
  });

  protected irACanal(origen: string): void {
    void this.router.navigate(['/leads'], { queryParams: { origen } });
  }

  /** Un lead abre el chat de esa paciente (lo que hay que hacer con él); una venta, Ventas. */
  protected irAActividad(item: Pick<ActividadItem, 'tipo' | 'cliente'>): void {
    if (item.tipo === 'LEAD') {
      void this.router.navigate(['/conversaciones'], { queryParams: enlaceAlChat(item.cliente.telefono) });
    } else {
      void this.router.navigate(['/ventas']);
    }
  }
}

/** «hace 5 min», «14:32», «18 sep». */
function cuando(iso: string, ahora: number): string {
  const fecha = new Date(iso);
  const minutos = Math.floor((ahora - fecha.getTime()) / 60_000);
  if (minutos < 1) return 'ahora';
  if (minutos < 60) return `hace ${minutos} min`;
  if (fecha.toDateString() === new Date(ahora).toDateString()) {
    return fecha.toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' });
  }
  return fecha.toLocaleDateString('es-BO', { day: 'numeric', month: 'short' });
}
