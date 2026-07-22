import { ChangeDetectionStrategy, Component, ViewEncapsulation } from '@angular/core';

/**
 * Organismo Table — tabla estándar del sistema de diseño.
 * Se usa proyectando <thead>/<tbody> nativos dentro de <app-table>:
 *
 *   <app-table>
 *     <thead><tr><th>…</th></tr></thead>
 *     <tbody><tr><td>…</td></tr></tbody>
 *   </app-table>
 *
 * Encapsulation None + clases con prefijo .crm-table para poder estilar
 * el contenido proyectado sin duplicar CSS en cada vista.
 * Ref: CRM_MANIFESTO.md §4.3 (organismos) y guía de tablas del diseño:
 * cabeceras 13-14px gris sobre #F8F9FA, filas blancas separadas por bordes sutiles.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-table',
  encapsulation: ViewEncapsulation.None,
  template: `
    <div class="crm-table-wrap">
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
    }

    .crm-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 14px;
    }

    .crm-table thead th {
      background: var(--color-bg-workspace);
      color: var(--color-text-muted);
      font-weight: 500;
      font-size: 13px;
      text-align: left;
      padding: 14px 24px;
      white-space: nowrap;
    }

    .crm-table tbody td {
      padding: 16px 24px;
      border-top: 1px solid var(--color-border);
      color: var(--color-text-dark);
      vertical-align: middle;
    }

    .crm-table tbody tr {
      transition: background-color 0.15s ease;
    }

    .crm-table tbody tr:hover {
      background: color-mix(in srgb, var(--color-bg-light) 40%, white);
    }
  `,
})
export class TableComponent {}
