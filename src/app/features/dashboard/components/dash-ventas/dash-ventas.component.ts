import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal } from '@angular/core';

import { MonedaService } from '../../../../core/moneda/moneda.service';
import { CardComponent } from '../../../../shared/components/card/card.component';
import { EmptyStateComponent } from '../../../../shared/components/empty-state/empty-state.component';
import { KpiResumen, topeRedondo } from '../../kpis.model';

/** Una sola instancia: construir un `Intl.NumberFormat` por llamada es lo caro. */
const DECIMAL = new Intl.NumberFormat('es-BO', { maximumFractionDigits: 1 });

/**
 * «10 mil», «2,5 mil», «1 M». `notation: 'compact'` de es-BO da «10 k» y
 * «5 K» según el número: mezclaba las dos en el mismo eje.
 */
function compacto(valor: number): string {
  if (valor >= 1_000_000) return `${DECIMAL.format(valor / 1_000_000)} M`;
  if (valor >= 1_000) return `${DECIMAL.format(valor / 1_000)} mil`;
  return DECIMAL.format(valor);
}

/**
 * Lo vendido en el periodo, sumado día a día (semana a semana en tres meses):
 * la línea siempre sube y dice cómo va el mes. Ocupa el sitio de las barras de
 * «Leads por día» (16/11/2026), que administración pidió quitar: un día con 72
 * leads aplastaba a los demás, las cifras del eje se montaban sobre la primera
 * barra, y los leads ya están en su tarjeta, el embudo y el mapa de horas.
 *
 * Las coordenadas van de 0 a 100 en los dos ejes y el SVG se estira
 * (`preserveAspectRatio="none"`): así el punto y la marca, que son HTML, se
 * colocan con los mismos porcentajes que el trazo.
 */
@Component({
  selector: 'app-dash-ventas',
  imports: [CardComponent, EmptyStateComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './dash-ventas.component.html',
  styleUrl: './dash-ventas.component.css',
})
export class DashVentasComponent {
  private readonly moneda = inject(MonedaService);

  readonly resumen = input.required<KpiResumen>();

  protected readonly grafico = computed(() => {
    const r = this.resumen();
    const semanal = r.periodo.granularidad === 'SEMANA';
    /* El tope se redondea en la moneda que se ve: en dólares, «2,5 mil», no 17.400 Bs convertidos. */
    const enVista = (bob: number) => (this.moneda.esUsd() ? this.moneda.convertirDeBob(bob) : bob);
    let suma = 0;
    const puntos = r.serie.map(p => ({ fecha: p.fecha, delTramo: p.ventas, acumulado: (suma += p.ventas) }));
    const tope = topeRedondo(enVista(suma));
    const n = puntos.length;
    const ubicados = puntos.map((p, i) => ({
      ...p,
      x: n > 1 ? (i / (n - 1)) * 100 : 100,
      y: 100 - (enVista(p.acumulado) / tope) * 100,
    }));
    /* Un solo día (el 1 del mes) es una recta, no un punto suelto. */
    const trazo = n > 1 ? ubicados : ubicados.length ? [{ ...ubicados[0], x: 0 }, ubicados[0]] : [];
    const linea = trazo.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');
    const mejor = puntos.reduce<(typeof puntos)[number] | null>((m, p) => (p.delTramo > (m?.delTramo ?? 0) ? p : m), null);
    const mitad = r.serie[Math.floor(n / 2)];
    return {
      puntos: ubicados,
      linea,
      area: trazo.length ? `${linea} L${trazo[trazo.length - 1].x.toFixed(2)},100 L${trazo[0].x.toFixed(2)},100 Z` : '',
      tope: `${this.moneda.esUsd() ? '$us' : 'Bs'} ${compacto(tope)}`,
      mitadTope: `${this.moneda.esUsd() ? '$us' : 'Bs'} ${compacto(tope / 2)}`,
      ejes: n ? [etiqueta(puntos[0].fecha), mitad && n > 2 ? etiqueta(mitad.fecha) : '', etiqueta(puntos[n - 1].fecha)] : [],
      semanal,
      mejor,
      hayVentas: suma > 0,
    };
  });

  protected readonly total = computed(() => this.moneda.formatearBob(this.resumen().ventas.total));
  protected readonly cantidad = computed(() => this.resumen().ventas.cantidad);

  /** El punto que se señala o se toca; vuelve a ninguno al cambiar de periodo. */
  protected readonly activo = linkedSignal<unknown, number | null>({ source: () => this.grafico(), computation: () => null });

  /** El punto con la marca: el señalado o, sin ninguno, el último (dónde va hoy). */
  protected readonly marcado = computed(() => {
    const puntos = this.grafico().puntos;
    return puntos[this.activo() ?? puntos.length - 1] ?? null;
  });

  /** Una línea fija sobre el gráfico: no salta al pasar de un punto a otro. */
  protected readonly lectura = computed(() => {
    const g = this.grafico();
    const i = this.activo();
    const p = i !== null ? g.puntos[i] : null;
    if (p) {
      const cuando = g.semanal ? `Semana del ${etiqueta(p.fecha)}` : etiqueta(p.fecha);
      return `${cuando}: ${this.moneda.formatearBob(p.delTramo)} ${g.semanal ? 'esa semana' : 'ese día'} · ${this.moneda.formatearBob(p.acumulado)} acumulado`;
    }
    const r = this.resumen();
    const ticket = r.ventas.cantidad ? `Ticket promedio ${this.moneda.formatearBob(r.ventas.ticketPromedio)}` : '';
    const mejor = g.mejor
      ? `${g.semanal ? 'Mejor semana' : 'Mejor día'}: ${etiqueta(g.mejor.fecha)}, ${this.moneda.formatearBob(g.mejor.delTramo)}`
      : '';
    return [mejor, ticket].filter(Boolean).join(' · ');
  });

  /** El punto más cercano a donde está el puntero o el dedo. */
  protected senalar(evento: PointerEvent): void {
    const n = this.grafico().puntos.length;
    const caja = (evento.currentTarget as HTMLElement).getBoundingClientRect();
    if (!n || caja.width <= 0) return;
    const fraccion = Math.min(Math.max((evento.clientX - caja.left) / caja.width, 0), 1);
    this.activo.set(n > 1 ? Math.round(fraccion * (n - 1)) : 0);
  }
}

/** «9 nov». La fecha llega como día del calendario de La Paz, sin hora. */
function etiqueta(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString('es-BO', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}
