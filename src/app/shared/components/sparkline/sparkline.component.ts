import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

const ANCHO = 120;
const ALTO = 30;
/** Aire arriba y abajo para que el trazo no se corte contra el borde. */
const MARGEN = 3;

/**
 * Línea de tendencia sin ejes, para el pie de una tarjeta de indicador.
 *
 * Existe porque las tarjetas del dashboard dibujaban **trazos fijos escritos a
 * mano** (`'M0,25 Q15,10 30,18…'`): la misma curva hubiera o no ventas. Esta
 * se dibuja con los valores que recibe. Toma el color del texto
 * (`currentColor`), así que el tono lo decide quien la usa con una clase de la
 * paleta, nunca un hexadecimal.
 *
 * Un `null` es un tramo SIN dato (un día sin respuestas no tiene mediana): se
 * salta el punto en vez de dibujarlo en cero, que en un tiempo de espera
 * sería la mejor marca posible.
 */
@Component({
  selector: 'app-sparkline',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (trazo(); as d) {
      <svg class="block w-full h-full" viewBox="0 0 120 30" fill="none" preserveAspectRatio="none" aria-hidden="true">
        @if (area()) {
          <!-- El área cierra el trazo contra el suelo; el tono sigue siendo el del texto. -->
          <path [attr.d]="d + ' L' + bordes().fin + ',30 L' + bordes().inicio + ',30 Z'" fill="currentColor" fill-opacity="0.1" stroke="none" />
        }
        <path [attr.d]="d" stroke="currentColor" [attr.stroke-width]="grosor()" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke" />
      </svg>
    }
  `,
})
export class SparklineComponent {
  readonly valores = input.required<ReadonlyArray<number | null>>();
  /** Rellena suavemente debajo del trazo: la tendencia se lee de un vistazo, sin ejes. */
  readonly area = input(false);
  readonly grosor = input(2.5);

  /** Dónde empieza y termina el trazo: el primer y el último punto con dato, no siempre los bordes. */
  protected readonly bordes = computed(() => {
    const valores = this.valores();
    const paso = ANCHO / Math.max(valores.length - 1, 1);
    const primero = valores.findIndex(v => v !== null);
    let ultimo = valores.length - 1;
    while (ultimo > 0 && valores[ultimo] === null) ultimo--;
    return { inicio: (Math.max(primero, 0) * paso).toFixed(1), fin: (ultimo * paso).toFixed(1) };
  });

  protected readonly trazo = computed(() => {
    const valores = this.valores();
    const puntos = valores
      .map((v, i) => (v === null ? null : { i, v }))
      .filter((p): p is { i: number; v: number } => p !== null);
    if (puntos.length < 2) return null;

    const min = Math.min(...puntos.map(p => p.v));
    const max = Math.max(...puntos.map(p => p.v));
    const rango = max - min || 1;
    const paso = ANCHO / Math.max(valores.length - 1, 1);
    const xy = puntos.map(p => ({
      x: p.i * paso,
      /* Todo igual → línea al centro, no pegada al suelo. */
      y: max === min ? ALTO / 2 : ALTO - MARGEN - ((p.v - min) / rango) * (ALTO - 2 * MARGEN),
    }));

    const f = (n: number) => n.toFixed(1);
    let d = `M${f(xy[0].x)},${f(xy[0].y)}`;
    for (let k = 1; k < xy.length; k++) {
      const medio = { x: (xy[k - 1].x + xy[k].x) / 2, y: (xy[k - 1].y + xy[k].y) / 2 };
      d += ` Q${f(xy[k - 1].x)},${f(xy[k - 1].y)} ${f(medio.x)},${f(medio.y)}`;
    }
    const ultimo = xy[xy.length - 1];
    return `${d} L${f(ultimo.x)},${f(ultimo.y)}`;
  });
}
