import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal } from '@angular/core';
import { Router } from '@angular/router';

import { CategoriaCliente } from '../../../../core/api/db-enums';
import { ChartItem, BarChartComponent } from '../../../../shared/components/charts/bar-chart.component';
import { DonutChartComponent } from '../../../../shared/components/charts/donut-chart.component';
import { COLOR_NEUTRO_GRAFICO, colorDeRampa } from '../../../../shared/components/charts/rampa-graficos';
import { CardComponent } from '../../../../shared/components/card/card.component';
import { ErrorCargaComponent } from '../../../../shared/components/error-carga/error-carga.component';
import { IconComponent } from '../../../../shared/components/icon/icon.component';
import { InfoHintComponent } from '../../../../shared/components/info-hint/info-hint.component';
import { LoadingSkeletonComponent } from '../../../../shared/components/loading-skeleton/loading-skeleton.component';
import { ORIGEN_LABEL } from '../../../leads/lead.model';
import {
  BANDAS_HORA, DIAS_SEMANA_CORTOS, etiquetaDeBanda, KpiDetalle, KpiResumen, mapaDeCalor, PeriodoKpi, porcentaje, TRAMOS_RESPUESTA,
} from '../../kpis.model';
import { KpisService } from '../../kpis.service';

const CATEGORIA_LABEL: Readonly<Record<CategoriaCliente, string>> = {
  GOLD: 'Gold', SILVER: 'Silver', BRONZE: 'Bronze', PROSPECTO: 'Prospecto',
};

/**
 * Los tonos de la primera respuesta van de lo mejor (el verde de la marca) a lo
 * peor, y «sin respuesta» en gris claro: no es un tramo, es lo que falta.
 */
const TONO_TRAMO: Readonly<Record<keyof KpiDetalle['primeraRespuesta'], string>> = {
  menos15: 'var(--color-primary)',
  menosHora: 'var(--color-secondary)',
  menos4Horas: 'color-mix(in srgb, var(--color-secondary) 55%, white)',
  menosDia: 'color-mix(in srgb, var(--color-primary) 30%, white)',
  masDia: 'color-mix(in srgb, var(--color-primary) 65%, var(--color-text-dark))',
  sinRespuesta: COLOR_NEUTRO_GRAFICO,
};

/** Los resultados del asistente que se cuentan, en orden y con su tono. */
const RESULTADOS_ASISTENTE = [
  { clave: 'RESPONDIO', etiqueta: 'Respondió solo', tono: 'var(--color-primary)' },
  { clave: 'SUGIRIO', etiqueta: 'Sugirió a una agente', tono: 'var(--color-secondary)' },
  { clave: 'DERIVO', etiqueta: 'Pasó a una persona', tono: 'color-mix(in srgb, var(--color-primary) 35%, white)' },
  { clave: 'FALLO', etiqueta: 'Falló', tono: COLOR_NEUTRO_GRAFICO },
] as const;

/**
 * El análisis de abajo del Dashboard: tortas de canal, primera respuesta,
 * servicios, quién escribe y por qué línea; el mapa de cuándo escriben, y el
 * asistente. Se monta con `@defer (on viewport)` y pide `GET /kpis/detalle`
 * recién entonces: lo de arriba (lo que pide acción) no lo espera.
 *
 * Lo que ya trae el resumen (canales, servicios) no se vuelve a pedir: llega
 * por `resumen`.
 */
@Component({
  selector: 'app-dash-analisis',
  imports: [BarChartComponent, CardComponent, DonutChartComponent, ErrorCargaComponent, IconComponent, InfoHintComponent, LoadingSkeletonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './dash-analisis.component.html',
  styleUrl: './dash-analisis.component.css',
})
export class DashAnalisisComponent {
  private readonly kpis = inject(KpisService);
  private readonly router = inject(Router);

  readonly periodo = input.required<PeriodoKpi>();
  readonly resumen = input.required<KpiResumen>();

  protected readonly detalle = httpResource<KpiDetalle>(() => this.kpis.detalleRequest(this.periodo()));
  /** El último que llegó: al cambiar de periodo se queda, atenuado, como el resto del Dashboard. */
  protected readonly datos = linkedSignal<KpiDetalle | undefined, KpiDetalle | null>({
    /* `value()` lanza con el recurso en error: se pregunta antes. */
    source: () => (this.detalle.hasValue() ? this.detalle.value() : undefined),
    computation: (nuevo, previo) => nuevo ?? previo?.value ?? null,
  });
  protected readonly recargando = computed(() => this.detalle.isLoading() && this.datos() !== null);

  protected readonly dias = DIAS_SEMANA_CORTOS;
  protected readonly bandas = Array.from({ length: BANDAS_HORA }, (_, i) => i);

  /* ── Tortas que salen del resumen ── */

  protected readonly porCanal = computed<ChartItem[]>(() =>
    this.resumen().canales.map((c, i) => ({
      id: c.origen,
      label: ORIGEN_LABEL[c.origen] ?? c.origen,
      value: c.captados,
      sublabel: `${porcentaje(c.respondidos, c.captados) ?? 0} % resp.`,
      color: colorDeRampa(i),
    })),
  );

  protected readonly porServicio = computed<ChartItem[]>(() =>
    this.resumen().topServicios.map((s, i) => ({ label: s.producto, value: s.monto, sublabel: `${s.cantidad} ×`, color: colorDeRampa(i) })),
  );

  /* ── Tortas del detalle ── */

  protected readonly primeraRespuesta = computed(() => {
    const d = this.datos();
    if (!d) return null;
    const p = d.primeraRespuesta;
    const total = TRAMOS_RESPUESTA.reduce((s, t) => s + p[t.clave], 0);
    return {
      items: TRAMOS_RESPUESTA.filter(t => p[t.clave] > 0).map<ChartItem>(t => ({
        id: t.clave, label: t.etiqueta, value: p[t.clave], sublabel: `${p[t.clave]}`, color: TONO_TRAMO[t.clave],
      })),
      enLaHora: porcentaje(p.menos15 + p.menosHora, total),
      sinRespuesta: p.sinRespuesta,
    };
  });

  protected readonly porCategoria = computed<ChartItem[]>(() =>
    (this.datos()?.pacientesPorCategoria ?? []).map((c, i) => ({ label: CATEGORIA_LABEL[c.categoria], value: c.pacientes, color: colorDeRampa(i) })),
  );

  protected readonly porLinea = computed<ChartItem[]>(() =>
    (this.datos()?.chatsPorLinea ?? []).map(l => ({ id: l.lineaId, label: l.linea, value: l.chats })),
  );

  /* ── Mapa de calor ── */

  protected readonly mapa = computed(() => {
    const d = this.datos();
    return d ? mapaDeCalor(d.porHora) : null;
  });

  protected readonly pico = computed(() => {
    const p = this.mapa()?.pico;
    return p ? `${DIAS_SEMANA_CORTOS[p.dia]}, de ${etiquetaDeBanda(p.banda)}` : null;
  });

  /**
   * El fondo de una celda: el verde de la marca, más intenso cuanto más leads.
   * Una celda vacía es superficie (no gris de texto): se ve la rejilla sin ruido.
   */
  protected fondo(intensidad: number): string {
    if (intensidad <= 0) return 'var(--color-bg-workspace)';
    return `color-mix(in srgb, var(--color-primary) ${Math.round(12 + intensidad * 88)}%, var(--color-bg-light))`;
  }

  protected tituloCelda(dia: number, banda: number, leads: number): string {
    return `${DIAS_SEMANA_CORTOS[dia]}, ${etiquetaDeBanda(banda)}: ${leads} ${leads === 1 ? 'lead' : 'leads'}`;
  }

  protected readonly etiquetaBanda = (banda: number) => `${banda * 2}`;

  /* ── Asistente ── */

  protected readonly asistente = computed(() => {
    const a = this.datos()?.asistente;
    if (!a) return null;
    const filas = RESULTADOS_ASISTENTE.map(r => ({ ...r, cantidad: a[r.clave] ?? 0 })).filter(r => r.cantidad > 0);
    const total = filas.reduce((s, r) => s + r.cantidad, 0);
    if (total === 0) return null;
    const resuelto = porcentaje(a.RESPONDIO ?? 0, (a.RESPONDIO ?? 0) + (a.DERIVO ?? 0) + (a.FALLO ?? 0));
    return { filas: filas.map(r => ({ ...r, ancho: (r.cantidad / total) * 100 })), total, resuelto };
  });

  protected irACanal(origen: string): void {
    void this.router.navigate(['/leads'], { queryParams: { origen } });
  }
}
