import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

import { ButtonComponent } from '../../shared/components/button/button.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';

/**
 * Not Found — Ruta comodín (wildcard) de app.routes.ts.
 * Pantalla completa, sin LayoutComponent, para cubrir enlaces rotos o sesiones vencidas.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-not-found',
  imports: [EmptyStateComponent, ButtonComponent, RouterLink],
  template: `
    <div class="min-h-dvh bg-bg-workspace flex items-center justify-center p-4">
      <div class="bg-white rounded-2xl shadow-subtle max-w-md w-full">
        <app-empty-state
          icon="file-x"
          title="Página no encontrada"
          description="El enlace no existe o tu sesión pudo haber vencido.">
          <a routerLink="/">
            <app-button variant="primary">Volver al inicio</app-button>
          </a>
        </app-empty-state>
      </div>
    </div>
  `,
})
export class NotFoundPage {}
