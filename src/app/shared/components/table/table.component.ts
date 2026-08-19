import { ChangeDetectionStrategy, Component, ViewEncapsulation, input } from '@angular/core';

/**
 * Organismo Table — tabla estándar del sistema de diseño.
 * Se usa proyectando <thead>/<tbody> nativos dentro de <app-table>:
 *
 *   <app-table [dense]="true" [maxHeight]="'calc(100dvh - 220px)'">
 *     <thead><tr><th class="text-left">…</th><th class="text-right">…</th></tr></thead>
 *     <tbody><tr><td class="text-left">…</td><td class="text-right">…</td></tr></tbody>
 *   </app-table>
 *
 * Encapsulation None + clases con prefijo .crm-table para poder estilar
 * el contenido proyectado sin duplicar CSS en cada vista.
 * Ref: CRM_MANIFESTO.md §4.3 (organismos) y guía de tablas del diseño:
 * cabeceras 12px gris sobre #F8F9FA, filas blancas separadas por bordes sutiles.
 *
 * ## Dos contenedores, no uno — y no es decorativo
 *
 * El marco redondea y recorta; el de dentro es el que hace scroll. Estaban
 * fundidos en un solo `div` con `border-radius` **y** `overflow: auto`, y con la
 * cabecera en `position: sticky` eso se ve mal en cuanto la tabla scrollea: un
 * elemento sticky no queda recortado por el `border-radius` de su propio
 * contenedor de scroll, así que el fondo gris de la cabecera pintaba cuadrado
 * sobre las esquinas redondeadas y el contenido parecía salirse de la tabla.
 * Lo mismo abajo con `tfoot`, que también es sticky.
 *
 * Separarlos lo arregla sin tocar ninguna vista: el recorte pasa a un elemento
 * que NO scrollea, y dentro el sticky se mueve con total libertad.
 *
 * `.crm-table-dense` se queda en el marco a propósito: es ancestro de
 * `.crm-table`, así que los selectores que ya existían fuera —`resumen-anual`
 * afina ahí el alto de fila— siguen encontrando lo que buscan.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-table',
  encapsulation: ViewEncapsulation.None,
  template: `
    <div class="crm-table-marco" [class.crm-table-dense]="dense()">
      <div class="crm-table-scroll" [style.max-height]="maxHeight()">
        <table class="crm-table">
          <ng-content />
        </table>
      </div>
    </div>
  `,
  styles: `
    /* Recorta y enmarca. NO scrollea: si scrolleara, volvería el problema. */
    .crm-table-marco {
      width: 100%;
      background: white;
      border-radius: 16px;
      overflow: hidden;
      box-shadow: var(--shadow-subtle);
      border: 1px solid var(--color-border);
    }

    /* Scrollea. No lleva radio ni borde: de eso se encarga el marco. */
    .crm-table-scroll {
      width: 100%;
      overflow: auto;
      overscroll-behavior-x: contain;
    }

    .crm-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 14px;
    }

    .crm-table thead th {
      position: sticky;
      top: 0;
      z-index: 10;
      background: var(--color-bg-workspace);
      color: var(--color-text-muted);
      font-weight: 600;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.03em;
      text-align: left;
      padding: 12px 20px;
      white-space: nowrap;
      box-shadow: inset 0 -1px 0 var(--color-border), inset 0 -2px 0 rgba(0, 0, 0, 0.03);
    }

    .crm-table tbody td {
      padding: 14px 20px;
      border-top: 1px solid var(--color-border);
      color: var(--color-text-dark);
      vertical-align: middle;
    }

    /* Force cell alignments regardless of tag selector specificity */
    .crm-table thead th.text-right,
    .crm-table tbody td.text-right,
    .crm-table thead th.num,
    .crm-table tbody td.num {
      text-align: right !important;
      font-variant-numeric: tabular-nums;
    }

    .crm-table thead th.text-center,
    .crm-table tbody td.text-center {
      text-align: center !important;
    }

    .crm-table thead th.text-left,
    .crm-table tbody td.text-left {
      text-align: left !important;
    }

    /* Fila de totales: se separa del cuerpo y no reacciona al hover, porque
       no es un registro más sino el resumen de la tabla. */
    .crm-table tfoot td {
      position: sticky;
      bottom: 0;
      z-index: 9;
      padding: 12px 20px;
      background: var(--color-bg-light);
      box-shadow: inset 0 2px 0 var(--color-border);
      color: var(--color-text-dark);
      font-weight: 700;
      font-variant-numeric: tabular-nums;
    }

    .crm-table tfoot td.text-right,
    .crm-table tfoot td.num {
      text-align: right;
    }

    .crm-table tfoot td.text-center {
      text-align: center;
    }

    .crm-table tbody tr {
      transition: background-color 0.15s ease;
    }

    .crm-table tbody tr:hover {
      background: color-mix(in srgb, var(--color-bg-light) 40%, white);
    }


    /* ── Alineación heredada de la cabecera ────────────────────────── */
    .crm-table:has(thead th:nth-child(1).text-right) tbody td:nth-child(1),
    .crm-table:has(thead th:nth-child(1).text-right) tfoot td:nth-child(1) { text-align: right; }
    .crm-table:has(thead th:nth-child(1).text-center) tbody td:nth-child(1),
    .crm-table:has(thead th:nth-child(1).text-center) tfoot td:nth-child(1) { text-align: center; }
    .crm-table:has(thead th:nth-child(1).text-left) tbody td:nth-child(1),
    .crm-table:has(thead th:nth-child(1).text-left) tfoot td:nth-child(1) { text-align: left; }
    .crm-table:has(thead th:nth-child(2).text-right) tbody td:nth-child(2),
    .crm-table:has(thead th:nth-child(2).text-right) tfoot td:nth-child(2) { text-align: right; }
    .crm-table:has(thead th:nth-child(2).text-center) tbody td:nth-child(2),
    .crm-table:has(thead th:nth-child(2).text-center) tfoot td:nth-child(2) { text-align: center; }
    .crm-table:has(thead th:nth-child(2).text-left) tbody td:nth-child(2),
    .crm-table:has(thead th:nth-child(2).text-left) tfoot td:nth-child(2) { text-align: left; }
    .crm-table:has(thead th:nth-child(3).text-right) tbody td:nth-child(3),
    .crm-table:has(thead th:nth-child(3).text-right) tfoot td:nth-child(3) { text-align: right; }
    .crm-table:has(thead th:nth-child(3).text-center) tbody td:nth-child(3),
    .crm-table:has(thead th:nth-child(3).text-center) tfoot td:nth-child(3) { text-align: center; }
    .crm-table:has(thead th:nth-child(3).text-left) tbody td:nth-child(3),
    .crm-table:has(thead th:nth-child(3).text-left) tfoot td:nth-child(3) { text-align: left; }
    .crm-table:has(thead th:nth-child(4).text-right) tbody td:nth-child(4),
    .crm-table:has(thead th:nth-child(4).text-right) tfoot td:nth-child(4) { text-align: right; }
    .crm-table:has(thead th:nth-child(4).text-center) tbody td:nth-child(4),
    .crm-table:has(thead th:nth-child(4).text-center) tfoot td:nth-child(4) { text-align: center; }
    .crm-table:has(thead th:nth-child(4).text-left) tbody td:nth-child(4),
    .crm-table:has(thead th:nth-child(4).text-left) tfoot td:nth-child(4) { text-align: left; }
    .crm-table:has(thead th:nth-child(5).text-right) tbody td:nth-child(5),
    .crm-table:has(thead th:nth-child(5).text-right) tfoot td:nth-child(5) { text-align: right; }
    .crm-table:has(thead th:nth-child(5).text-center) tbody td:nth-child(5),
    .crm-table:has(thead th:nth-child(5).text-center) tfoot td:nth-child(5) { text-align: center; }
    .crm-table:has(thead th:nth-child(5).text-left) tbody td:nth-child(5),
    .crm-table:has(thead th:nth-child(5).text-left) tfoot td:nth-child(5) { text-align: left; }
    .crm-table:has(thead th:nth-child(6).text-right) tbody td:nth-child(6),
    .crm-table:has(thead th:nth-child(6).text-right) tfoot td:nth-child(6) { text-align: right; }
    .crm-table:has(thead th:nth-child(6).text-center) tbody td:nth-child(6),
    .crm-table:has(thead th:nth-child(6).text-center) tfoot td:nth-child(6) { text-align: center; }
    .crm-table:has(thead th:nth-child(6).text-left) tbody td:nth-child(6),
    .crm-table:has(thead th:nth-child(6).text-left) tfoot td:nth-child(6) { text-align: left; }
    .crm-table:has(thead th:nth-child(7).text-right) tbody td:nth-child(7),
    .crm-table:has(thead th:nth-child(7).text-right) tfoot td:nth-child(7) { text-align: right; }
    .crm-table:has(thead th:nth-child(7).text-center) tbody td:nth-child(7),
    .crm-table:has(thead th:nth-child(7).text-center) tfoot td:nth-child(7) { text-align: center; }
    .crm-table:has(thead th:nth-child(7).text-left) tbody td:nth-child(7),
    .crm-table:has(thead th:nth-child(7).text-left) tfoot td:nth-child(7) { text-align: left; }
    .crm-table:has(thead th:nth-child(8).text-right) tbody td:nth-child(8),
    .crm-table:has(thead th:nth-child(8).text-right) tfoot td:nth-child(8) { text-align: right; }
    .crm-table:has(thead th:nth-child(8).text-center) tbody td:nth-child(8),
    .crm-table:has(thead th:nth-child(8).text-center) tfoot td:nth-child(8) { text-align: center; }
    .crm-table:has(thead th:nth-child(8).text-left) tbody td:nth-child(8),
    .crm-table:has(thead th:nth-child(8).text-left) tfoot td:nth-child(8) { text-align: left; }
    .crm-table:has(thead th:nth-child(9).text-right) tbody td:nth-child(9),
    .crm-table:has(thead th:nth-child(9).text-right) tfoot td:nth-child(9) { text-align: right; }
    .crm-table:has(thead th:nth-child(9).text-center) tbody td:nth-child(9),
    .crm-table:has(thead th:nth-child(9).text-center) tfoot td:nth-child(9) { text-align: center; }
    .crm-table:has(thead th:nth-child(9).text-left) tbody td:nth-child(9),
    .crm-table:has(thead th:nth-child(9).text-left) tfoot td:nth-child(9) { text-align: left; }
    .crm-table:has(thead th:nth-child(10).text-right) tbody td:nth-child(10),
    .crm-table:has(thead th:nth-child(10).text-right) tfoot td:nth-child(10) { text-align: right; }
    .crm-table:has(thead th:nth-child(10).text-center) tbody td:nth-child(10),
    .crm-table:has(thead th:nth-child(10).text-center) tfoot td:nth-child(10) { text-align: center; }
    .crm-table:has(thead th:nth-child(10).text-left) tbody td:nth-child(10),
    .crm-table:has(thead th:nth-child(10).text-left) tfoot td:nth-child(10) { text-align: left; }
    .crm-table:has(thead th:nth-child(11).text-right) tbody td:nth-child(11),
    .crm-table:has(thead th:nth-child(11).text-right) tfoot td:nth-child(11) { text-align: right; }
    .crm-table:has(thead th:nth-child(11).text-center) tbody td:nth-child(11),
    .crm-table:has(thead th:nth-child(11).text-center) tfoot td:nth-child(11) { text-align: center; }
    .crm-table:has(thead th:nth-child(11).text-left) tbody td:nth-child(11),
    .crm-table:has(thead th:nth-child(11).text-left) tfoot td:nth-child(11) { text-align: left; }
    .crm-table:has(thead th:nth-child(12).text-right) tbody td:nth-child(12),
    .crm-table:has(thead th:nth-child(12).text-right) tfoot td:nth-child(12) { text-align: right; }
    .crm-table:has(thead th:nth-child(12).text-center) tbody td:nth-child(12),
    .crm-table:has(thead th:nth-child(12).text-center) tfoot td:nth-child(12) { text-align: center; }
    .crm-table:has(thead th:nth-child(12).text-left) tbody td:nth-child(12),
    .crm-table:has(thead th:nth-child(12).text-left) tfoot td:nth-child(12) { text-align: left; }
    .crm-table:has(thead th:nth-child(13).text-right) tbody td:nth-child(13),
    .crm-table:has(thead th:nth-child(13).text-right) tfoot td:nth-child(13) { text-align: right; }
    .crm-table:has(thead th:nth-child(13).text-center) tbody td:nth-child(13),
    .crm-table:has(thead th:nth-child(13).text-center) tfoot td:nth-child(13) { text-align: center; }
    .crm-table:has(thead th:nth-child(13).text-left) tbody td:nth-child(13),
    .crm-table:has(thead th:nth-child(13).text-left) tfoot td:nth-child(13) { text-align: left; }
    .crm-table:has(thead th:nth-child(14).text-right) tbody td:nth-child(14),
    .crm-table:has(thead th:nth-child(14).text-right) tfoot td:nth-child(14) { text-align: right; }
    .crm-table:has(thead th:nth-child(14).text-center) tbody td:nth-child(14),
    .crm-table:has(thead th:nth-child(14).text-center) tfoot td:nth-child(14) { text-align: center; }
    .crm-table:has(thead th:nth-child(14).text-left) tbody td:nth-child(14),
    .crm-table:has(thead th:nth-child(14).text-left) tfoot td:nth-child(14) { text-align: left; }

    /* Modo denso (ideal para planillas de datos / Excel) */
    .crm-table-dense .crm-table thead th {
      padding: 10px 14px;
      font-size: 11px;
    }

    .crm-table-dense .crm-table tbody td {
      padding: 10px 14px;
      font-size: 13px;
    }

    .crm-table-dense .crm-table tfoot td {
      padding: 11px 14px;
      font-size: 13px;
    }
  `,
})
export class TableComponent {
  readonly dense = input<boolean>(false);
  readonly maxHeight = input<string | undefined>(undefined);
}
