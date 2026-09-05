import { CdkTrapFocus } from '@angular/cdk/a11y';
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import { ButtonComponent } from '../button/button.component';
import { IconComponent, IconName } from '../icon/icon.component';

/**
 * Escala de anchos del cajón. Cerrada a propósito: antes cada vista escribía su
 * propio `sm:w-[520px] lg:w-[580px]` y había cinco pares distintos —500/540,
 * 500/560, 520/580, 560/640, 600/720— sin ninguna razón de diseño detrás, solo
 * el ancho que le pareció a quien copió la plantilla. Cinco escalones cubren
 * todos los casos reales y hacen que dos cajones hermanos se abran igual.
 *
 * `ancho` es el de dos columnas —el historial clínico y el perfil del médico—:
 * ficha a la izquierda, línea de tiempo a la derecha. Ahí un panel de 580px
 * dejaba todo en una columna larguísima con la línea de tiempo en su propio
 * scroll. `94vw` evita que en un portátil quede pegado a los bordes.
 */
export type DrawerAncho = 'sm' | 'md' | 'lg' | 'xl' | 'ancho';

/**
 * Átomo Drawer — el cajón lateral del CRM (CRM_MANIFESTO.md §3.2, §4.2).
 *
 * **Por qué existe.** La conversión de los modales a cajones (2026-09-05) dejó
 * diez copias del mismo `<aside class="h-full w-full sm:w-[…] bg-white
 * shadow-lifted border-l …">` repartidas por seis plantillas, y seis copias del
 * mismo bloque de cabecera (chip de icono + título + subtítulo + botón cerrar).
 * Con eso, cualquier ajuste al cajón —una sombra, el ancho en móvil, la
 * animación— había que aplicarlo diez veces y acordarse de las diez.
 *
 * **Qué resuelve además de la duplicación**, y esto es lo que no se ve en el
 * diff: los cajones declaraban `role="dialog" aria-modal="true"` sin trampa de
 * foco. Es una afirmación falsa —`aria-modal` le dice al lector de pantalla que
 * nada fuera del cajón existe— y con el teclado el tabulador se escapaba a la
 * tabla de atrás, que sigue ahí y no se ve. `cdkTrapFocus` con captura
 * automática mueve el foco al abrir, lo retiene mientras está abierto y lo
 * devuelve al elemento que lo abrió al cerrar.
 *
 * **El fondo, el apilado y la tecla Escape NO son suyos**: los pone
 * `DialogService.abrirCajon()`, que proyecta este componente en `document.body`
 * con CDK Overlay. Un cajón con `fixed` propio se queda dentro del árbol de la
 * página peleando por z-index contra el header, el sidebar y el FAB — y
 * perdiendo (ya pasó en Servicios).
 *
 * **Cabecera.** La estándar sale de `titulo`/`subtitulo`/`icono`. Una vista con
 * cabecera propia —la ficha del lead lleva avatar y badges, la del paciente
 * además una barra de pestañas— proyecta la suya con `<div cabecera>` (fila del
 * título) y `<div subcabecera>` (bloque a todo el ancho debajo); el átomo sigue
 * poniendo el marco y el botón de cerrar.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-drawer',
  imports: [ButtonComponent, IconComponent, CdkTrapFocus],
  template: `
    <aside
      [class]="clases()"
      cdkTrapFocus
      [cdkTrapFocusAutoCapture]="true"
      role="dialog"
      aria-modal="true"
      [attr.aria-labelledby]="titulo() ? tituloId : null"
      [attr.aria-label]="titulo() ? null : etiqueta()">
      <header class="px-6 py-4.5 border-b border-border bg-white shrink-0">
        <div class="flex items-start justify-between gap-3">
          @if (titulo(); as t) {
            <div class="flex items-center gap-3 min-w-0">
              @if (icono(); as ic) {
                <div
                  class="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0">
                  <app-icon [name]="ic" [size]="18" />
                </div>
              }
              <div class="min-w-0">
                <h2
                  [id]="tituloId"
                  class="text-sm font-bold text-text-dark tracking-tight leading-tight truncate">
                  {{ t }}
                </h2>
                @if (subtitulo(); as s) {
                  <p class="text-xs text-text-muted leading-tight mt-0.5 truncate">{{ s }}</p>
                }
              </div>
            </div>
          } @else {
            <div class="min-w-0 flex-1">
              <ng-content select="[cabecera]" />
            </div>
          }

          <app-button
            variant="ghost"
            size="sm"
            icon="x"
            [circle]="true"
            ariaLabel="Cerrar"
            (clicked)="cerrar.emit()" />
        </div>

        <!-- Bloque a todo el ancho bajo la fila del título: las pestañas de la
             ficha del paciente. Va dentro del header para que comparta su fondo
             y su borde inferior, y aparte del slot [cabecera] porque ahí
             quedaría en la columna estrecha, peleando sitio con el botón de
             cerrar. -->
        <ng-content select="[subcabecera]" />
      </header>

      <!-- Cuerpo y pie los proyecta la vista en orden. El aside es la columna
           flex, así que un cuerpo con flex-1 + overflow-y-auto scrollea y un pie
           con shrink-0 queda fijo abajo — sin que el átomo tenga que adivinar
           cuál es cuál. -->
      <ng-content />
    </aside>
  `,
  styles: `
    /* El host desaparece del layout para que el aside sea el hijo directo del
       panel flex del overlay (justify-end); si no, el cajón quedaría dentro de
       una caja intermedia que no sabe alinearse. */
    :host {
      display: contents;
    }
  `,
})
export class DrawerComponent {
  private static contador = 0;

  /** Título de la cabecera estándar. Sin él se proyecta `<div cabecera>`. */
  readonly titulo = input<string | undefined>(undefined);
  readonly subtitulo = input<string | undefined>(undefined);
  readonly icono = input<IconName | undefined>(undefined);
  readonly ancho = input<DrawerAncho>('md');

  /**
   * Nombre accesible cuando la vista trae cabecera propia. Es obligatorio en
   * ese caso: un `role="dialog"` sin nombre se anuncia como "diálogo" a secas.
   */
  readonly etiqueta = input<string>('Panel lateral');

  readonly cerrar = output<void>();

  protected readonly tituloId = `drawer-titulo-${DrawerComponent.contador++}`;

  private static readonly ANCHOS: Record<DrawerAncho, string> = {
    sm: 'sm:w-[500px] lg:w-[540px]',
    md: 'sm:w-[520px] lg:w-[580px]',
    lg: 'sm:w-[560px] lg:w-[640px]',
    xl: 'sm:w-[600px] lg:w-[720px]',
    ancho: 'lg:w-[min(72rem,94vw)]',
  };

  protected readonly clases = computed(
    () =>
      'h-full w-full bg-white shadow-lifted border-l border-border flex flex-col ' +
      `pointer-events-auto animate-drawer-in ${DrawerComponent.ANCHOS[this.ancho()]}`,
  );
}
