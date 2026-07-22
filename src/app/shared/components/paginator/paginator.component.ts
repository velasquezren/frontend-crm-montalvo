import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import { ButtonComponent } from '../button/button.component';

/**
 * Molécula Paginator — controles de página para listados.
 * Se alimenta del sobre `RespuestaPaginada` del backend.
 * Ref: CRM_MANIFESTO.md §4.2.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-paginator',
  imports: [ButtonComponent],
  template: `
    @if (totalPaginas() > 1) {
      <div class="flex flex-wrap items-center justify-between gap-4 px-1">
        <p class="text-xs text-text-muted">
          Mostrando <span class="font-medium text-text-dark">{{ desde() }}–{{ hasta() }}</span>
          de <span class="font-medium text-text-dark">{{ total() }}</span>
        </p>

        <div class="flex items-center gap-2">
          <app-button
            variant="secondary"
            size="sm"
            [disabled]="pagina() <= 1"
            (clicked)="cambiar.emit(pagina() - 1)">
            Anterior
          </app-button>

          <span class="text-xs text-text-muted px-2 whitespace-nowrap">
            Página {{ pagina() }} de {{ totalPaginas() }}
          </span>

          <app-button
            variant="secondary"
            size="sm"
            [disabled]="pagina() >= totalPaginas()"
            (clicked)="cambiar.emit(pagina() + 1)">
            Siguiente
          </app-button>
        </div>
      </div>
    }
  `,
})
export class PaginatorComponent {
  readonly pagina = input.required<number>();
  readonly totalPaginas = input.required<number>();
  readonly total = input.required<number>();
  readonly limite = input<number>(25);

  readonly cambiar = output<number>();

  protected readonly desde = computed(() =>
    this.total() === 0 ? 0 : (this.pagina() - 1) * this.limite() + 1,
  );

  protected readonly hasta = computed(() =>
    Math.min(this.pagina() * this.limite(), this.total()),
  );
}
