import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { BadgeComponent } from '../../../../../shared/components/badge/badge.component';
import { IconComponent } from '../../../../../shared/components/icon/icon.component';
import { InfoHintComponent } from '../../../../../shared/components/info-hint/info-hint.component';
import { MonedaPipe } from '../../../../../shared/pipes/moneda.pipe';
import { FilaConsolidado } from '../../../../planilla-comisiones/planilla.model';

/** Un objetivo de planes resuelto: cuántos van, cuántos hacían falta, cuántos pagan. */
export interface MetaPlanes {
  readonly etiqueta: string;
  readonly vendidos: number;
  readonly objetivo: number;
  /** Los que de verdad comisionan, tal como los contó el backend. */
  readonly comisionables: number;
  /** 0-100 para la barra. Se satura en 100: el excedente lo dice el texto. */
  readonly avance: number;
}

/** Un tramo de la escala de cirugías, ya en números. */
export interface TramoCirugia {
  readonly nivel: number;
  readonly desde: number;
  readonly hasta: number;
  readonly pct: number;
}

/**
 * Las metas del mes: los DOS objetivos de planes y el tramo de cirugías.
 *
 * ## Por qué son dos objetivos y no uno
 *
 * Paquetes de maternidad (PLANPAQ) y planes varios (PLANNIN) son categorías
 * distintas con metas distintas —4 o 6 contra 1— y el backend las cuenta por
 * separado. Esta tarjeta mostraba `planesVendidos`, que es la SUMA de las dos,
 * contra la meta de paquetes: "8 / 6 planes". Cuando los dos tipos conviven en
 * el mismo mes, esa resta no es la que se paga.
 *
 * Ahora cada objetivo se muestra con su propio contador, y los comisionables NO
 * se recalculan aquí: se leen de `planpaqComisionables` / `planninComisionables`,
 * que son los que el motor usó para pagar. Una pantalla que rehace la cuenta es
 * una pantalla que puede contradecir a la liquidación.
 *
 * ## Por qué las cifras llegan por `input` y no están escritas aquí
 *
 * Las metas y los tramos de cirugía los edita administración, y además quedan
 * congelados con cada liquidación (`periodo.configuracionUsada`). Tenerlos en
 * una constante del componente significaba que al cambiarlos en Configuración
 * esta pantalla seguía enseñando los viejos —y al mirar un mes antiguo, enseñaba
 * los de hoy en vez de los que se le aplicaron.
 */
@Component({
  selector: 'app-metas-agente',
  imports: [BadgeComponent, IconComponent, InfoHintComponent, MonedaPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './metas-agente.component.html',
  styleUrl: './metas-agente.component.css',
})
export class MetasAgenteComponent {
  readonly fila = input.required<FilaConsolidado>();
  /** Los dos objetivos de planes, ya resueltos por el padre. */
  readonly metas = input.required<readonly MetaPlanes[]>();
  /** La escala de cirugías vigente para ESTE periodo. */
  readonly tramos = input.required<readonly TramoCirugia[]>();

  /** Dónde cayó el acumulado de cirugías, y qué falta para el siguiente tramo. */
  protected readonly cirugias = computed(() => {
    const v = this.fila();
    const acumulado = v.acumuladoCirugias;
    const escala = this.tramos();

    const actual = escala.find(t => t.nivel === v.nivelCirugia) ?? null;
    const siguiente = actual ? (escala.find(t => t.nivel === actual.nivel + 1) ?? null) : escala[0];

    return {
      acumulado,
      nivel: actual?.nivel ?? 0,
      pct: actual?.pct ?? 0,
      siguienteNivel: siguiente?.nivel ?? null,
      falta: siguiente ? Math.max(0, siguiente.desde - acumulado) : 0,
      /* El avance se mide contra el techo del tramo alcanzado, no contra el
         número de tramos: así la barra dice "cuánto me falta para subir" y no
         "en qué escalón estoy", que ya lo dice la insignia. */
      avance: siguiente ? Math.min(100, Math.round((acumulado / siguiente.desde) * 100)) : 100,
    };
  });
}
