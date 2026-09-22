import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { AuthService } from '../../core/auth/auth.service';
import { generarIniciales } from '../../core/auth/user.model';
import { MonedaService } from '../../core/moneda/moneda.service';
import { AvatarComponent } from '../../shared/components/avatar/avatar.component';
import { ButtonComponent } from '../../shared/components/button/button.component';
import { CardComponent } from '../../shared/components/card/card.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { ErrorCargaComponent } from '../../shared/components/error-carga/error-carga.component';
import { IconComponent } from '../../shared/components/icon/icon.component';
import { InfoHintComponent } from '../../shared/components/info-hint/info-hint.component';
import { KpiCardComponent } from '../../shared/components/kpi-card/kpi-card.component';
import { LoadingSkeletonComponent } from '../../shared/components/loading-skeleton/loading-skeleton.component';
import { TableComponent } from '../../shared/components/table/table.component';
import { NombreClientePipe } from '../../shared/pipes/nombre-cliente.pipe';
import { ORIGEN_LABEL } from '../leads/lead.model';
import { ActividadItem, formatearEspera, KpiResumen, PeriodoKpi, porcentaje, variacion } from './kpis.model';
import { KpisService } from './kpis.service';

const PERIODOS: ReadonlyArray<{ clave: PeriodoKpi; label: string; comparado: string }> = [
  { clave: 'MES', label: 'Este mes', comparado: 'el mes pasado a esta altura' },
  { clave: 'MES_ANTERIOR', label: 'Mes anterior', comparado: 'el mes previo' },
  { clave: 'TRES_MESES', label: '3 meses', comparado: 'los tres meses previos' },
];

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
    ButtonComponent,
    CardComponent,
    EmptyStateComponent,
    ErrorCargaComponent,
    IconComponent,
    InfoHintComponent,
    KpiCardComponent,
    LoadingSkeletonComponent,
    NombreClientePipe,
    TableComponent,
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

  private readonly comparado = computed(() => PERIODOS.find(p => p.clave === this.periodo())?.comparado ?? '');

  protected readonly tarjetas = computed(() => {
    const r = this.kpiData.value();
    if (!r) return null;
    const { embudo, ventas } = r;
    const vsLeads = variacion(embudo.captados, embudo.anterior.captados);
    const vsVentas = variacion(ventas.total, ventas.anterior.total);
    const tasa = porcentaje(embudo.respondidos, embudo.captados);
    const rapido = porcentaje(embudo.respondidosEnUnaHora, embudo.captados);
    const sinRespuesta = embudo.captados - embudo.respondidos;
    return {
      leads: {
        valor: embudo.captados,
        pie: vsLeads ? `${vsLeads.texto} ${this.comparado()}` : 'Sin periodo anterior con qué comparar',
        icono: vsLeads?.sube === false ? undefined : ('trending-up' as const),
      },
      respondidos: {
        valor: tasa === null ? '—' : `${tasa} %`,
        pie: embudo.captados ? `${embudo.respondidos} de ${embudo.captados} · ${sinRespuesta} sin respuesta` : 'Sin leads en el periodo',
      },
      respuesta: {
        valor: formatearEspera(embudo.medianaRespuestaMinutos),
        pie: rapido === null ? 'Sin respuestas en el periodo' : `${rapido} % respondidos en la primera hora`,
      },
      ventas: {
        valor: this.moneda.formatearBob(ventas.total),
        pie: ventas.cantidad
          ? `${ventas.cantidad} ${ventas.cantidad === 1 ? 'venta' : 'ventas'} · ticket ${this.moneda.formatearBob(ventas.ticketPromedio)}` +
            (vsVentas ? ` · ${vsVentas.texto} ${this.comparado()}` : '')
          : 'Sin ventas registradas en el periodo',
      },
    };
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
