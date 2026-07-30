import { ChangeDetectionStrategy, Component, ViewEncapsulation, input } from '@angular/core';

/**
 * Organismo Table — tabla estándar del sistema de diseño.
 * Se usa proyectando <thead>/<tbody> nativos dentro de <app-table>:
 *
 *   <app-table [dense]="true">
 *     <thead><tr><th class="text-left">…</th><th class="text-right">…</th></tr></thead>
 *     <tbody><tr><td class="text-left">…</td><td class="text-right">…</td></tr></tbody>
 *   </app-table>
 *
 * Encapsulation None + clases con prefijo .crm-table para poder estilar
 * el contenido proyectado sin duplicar CSS en cada vista.
 * Ref: CRM_MANIFESTO.md §4.3 (organismos) y guía de tablas del diseño:
 * cabeceras 12px gris sobre #F8F9FA, filas blancas separadas por bordes sutiles.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-table',
  encapsulation: ViewEncapsulation.None,
  template: `
    <div class="crm-table-wrap" [class.crm-table-dense]="dense()">
      <table class="crm-table">
        <ng-content />
      </table>
    </div>
  `,
  styles: `
    .crm-table-wrap {
      width: 100%;
      overflow-x: auto;
      background: white;
      border-radius: 16px;
      box-shadow: var(--shadow-subtle);
      border: 1px solid var(--color-border);
    }

    .crm-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 14px;
    }

    .crm-table thead th {
      background: var(--color-bg-workspace);
      color: var(--color-text-muted);
      font-weight: 600;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.03em;
      text-align: left;
      padding: 12px 20px;
      white-space: nowrap;
      border-bottom: 1px solid var(--color-border);
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

    .crm-table tbody tr {
      transition: background-color 0.15s ease;
    }

    .crm-table tbody tr:hover {
      background: color-mix(in srgb, var(--color-bg-light) 40%, white);
    }

    /* Modo denso (ideal para planillas de datos / Excel) */
    .crm-table-dense .crm-table thead th {
      padding: 10px 14px;
      font-size: 11px;
    }

    .crm-table-dense .crm-table tbody td {
      padding: 10px 14px;
      font-size: 13px;
    }
  `,
})
export class TableComponent {
  readonly dense = input<boolean>(false);
}

