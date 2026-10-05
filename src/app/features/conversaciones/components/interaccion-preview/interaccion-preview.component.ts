import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { ButtonComponent } from '../../../../shared/components/button/button.component';

/** Proyección de presentación; nunca recibir response_json, originales ni flow_token. */
export interface InteraccionVista {
  tipo: 'botones' | 'lista' | 'seleccion' | 'flow' | 'respuesta_flow' | 'error';
  cuerpo: string;
  opciones?: readonly { id: string; titulo: string; descripcion?: string }[];
  seleccionId?: string;
  contextoId?: string;
  versionFlow?: string;
  estado?: 'CORRELACIONADA' | 'CADUCADA' | 'DUPLICADA' | 'NO_CORRELACIONADA' | 'INVALIDA' | 'DESCONOCIDA';
}

@Component({
  selector: 'app-interaccion-preview',
  imports: [ButtonComponent],
  template: `
    @if (habilitada()) {
      <section
        class="min-w-0 space-y-3 rounded-2xl border border-border bg-bg-light p-4 text-sm text-text-dark"
        [attr.aria-label]="historial() ? 'Interacción de WhatsApp' : 'Vista previa de interacción'"
      >
        <p class="font-semibold text-primary">{{ historial() ? 'Interacción de WhatsApp' : 'Demostración local · sin envío' }}</p>
        @if (cargando()) {
          <p role="status">Preparando vista previa…</p>
        } @else if (interaccion(); as vista) {
          <p class="whitespace-pre-wrap break-words">{{ vista.cuerpo }}</p>
          @if (vista.estado) {
            <p class="text-text-muted" role="status">{{ describirEstado(vista.estado) }}</p>
          }
          @switch (vista.tipo) {
            @case ('botones') {
              <div class="flex flex-wrap gap-2">
                @for (opcion of vista.opciones; track opcion.id) {
                  <app-button variant="secondary" size="sm" [disabled]="true">{{
                    opcion.titulo
                  }}</app-button>
                }
              </div>
            }
            @case ('lista') {
              <ul class="space-y-2" aria-label="Opciones de la lista">
                @for (opcion of vista.opciones; track opcion.id) {
                  <li class="break-words border-b border-border pb-2">
                    <p class="font-medium">{{ opcion.titulo }}</p>
                    @if (opcion.descripcion) {
                      <p class="text-text-muted">{{ opcion.descripcion }}</p>
                    }
                  </li>
                }
              </ul>
            }
            @case ('seleccion') {
              <p>Opción seleccionada por la persona.</p>
            }
            @case ('flow') {
              <p>{{ historial() ? 'Formulario ofrecido en WhatsApp' : 'Abrir formulario · demo' }}</p>
            }
            @case ('respuesta_flow') {
              <p>Formulario recibido. Pendiente de validación; no confirma una cita.</p>
            }
            @case ('error') {
              <p role="status">No se pudo interpretar la interacción. Requiere revisión humana.</p>
            }
          }
          @if (vista.seleccionId || vista.contextoId || vista.versionFlow) {
            <details class="break-words">
              <summary
                class="cursor-pointer font-medium text-primary focus-visible:outline-2 focus-visible:outline-primary"
              >
                Ver referencias
              </summary>
              <dl class="mt-2 space-y-1">
                @if (vista.versionFlow) {
                  <dt>Versión del formulario</dt>
                  <dd>{{ vista.versionFlow }}</dd>
                }
                @if (vista.seleccionId) {
                  <dt>Identificador de la opción</dt>
                  <dd>{{ vista.seleccionId }}</dd>
                }
                @if (vista.contextoId) {
                  <dt>Mensaje al que responde</dt>
                  <dd>{{ vista.contextoId }}</dd>
                }
              </dl>
            </details>
          }
        } @else {
          <p>No hay una interacción seleccionada.</p>
        }
      </section>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InteraccionPreviewComponent {
  /** El historial recibe exclusivamente la proyección segura del backend. */
  readonly historial = input(false);
  readonly habilitada = input(false);
  readonly cargando = input(false);
  readonly interaccion = input<InteraccionVista | null>(null);
  protected describirEstado(estado: NonNullable<InteraccionVista['estado']>): string {
    return ({
      CORRELACIONADA: 'Respuesta vinculada al mensaje original. Atención por el personal.',
      CADUCADA: 'La opción había caducado. Revisar con la persona.',
      DUPLICADA: 'Ya se había recibido una respuesta a este mensaje.',
      NO_CORRELACIONADA: 'No se pudo vincular a una opción ofrecida. Revisión humana.',
      INVALIDA: 'Respuesta incompleta o inválida. Revisión humana.',
      DESCONOCIDA: 'Tipo de mensaje todavía no compatible. Revisión humana.',
    })[estado];
  }
}
