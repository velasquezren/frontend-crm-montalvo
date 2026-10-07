import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';

import { mensajeDeError } from '../../../../core/api/http-error';
import { ToastService } from '../../../../core/toast/toast.service';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { DrawerComponent } from '../../../../shared/components/drawer/drawer.component';
import { InputComponent } from '../../../../shared/components/input/input.component';
import { BancoAgenda, datosDeFormulario, EspecialidadAgenda, FichaMedicoAgenda, formularioDe, FormularioMedicoAgenda } from '../../agenda-medicos.model';
import { AgendaMedicosService } from '../../agenda-medicos.service';
import { AgendaMedicoDatosComponent } from '../agenda-medico-datos/agenda-medico-datos.component';

/** El código de FileMaker: hasta 20 letras, números, espacios, puntos o guiones (`horarios.cod_med`). */
const CODIGO_FILEMAKER = /^[A-Za-z0-9][A-Za-z0-9 ._-]{0,19}$/;

/**
 * Alta de un médico en la agenda, como el formulario de ScriptCase. Pide el
 * código de FileMaker, que después no se puede cambiar: es el que une al médico
 * con FileMaker y con las citas. El horario se carga después, en su ficha.
 */
@Component({
  selector: 'app-agenda-nuevo-medico',
  imports: [AgendaMedicoDatosComponent, ButtonComponent, DrawerComponent, InputComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-drawer ancho="md" alto="contenido" titulo="Nuevo médico" subtitulo="Se crea en la agenda de la clínica" icono="user-plus" (cerrar)="cerrar.emit()">
      <form class="flex-1 min-h-0 flex flex-col" (submit)="$event.preventDefault(); crear()">
        <div class="flex-1 overflow-y-auto p-5 flex flex-col gap-4">
          <div class="flex flex-col gap-1">
            <app-input label="Código de FileMaker" placeholder="Ej. GIN-04" [disabled]="guardando()" [(value)]="codigo" />
            <p class="text-xs text-text-muted">El mismo con que figura en FileMaker. Después no se puede cambiar desde el CRM.</p>
          </div>
          <app-agenda-medico-datos [(formulario)]="formulario" [especialidades]="especialidades()" [bancos]="bancos()" [disabled]="guardando()" />
          @if (intento() && problema(); as p) {
            <p role="alert" class="text-xs text-text-dark">{{ p }}</p>
          }
        </div>
        <div class="flex justify-end gap-2 border-t border-border px-5 py-3 shrink-0">
          <app-button variant="ghost" [disabled]="guardando()" (clicked)="cerrar.emit()">Cancelar</app-button>
          <app-button type="submit" icon="check" [loading]="guardando()">Crear médico</app-button>
        </div>
      </form>
    </app-drawer>
  `,
})
export class AgendaNuevoMedicoComponent {
  private readonly servicio = inject(AgendaMedicosService);
  private readonly toast = inject(ToastService);

  readonly especialidades = input<readonly EspecialidadAgenda[]>([]);
  readonly bancos = input<readonly BancoAgenda[]>([]);
  readonly creado = output<FichaMedicoAgenda>();
  readonly cerrar = output<void>();

  protected readonly codigo = signal('');
  protected readonly formulario = signal<FormularioMedicoAgenda>(formularioDe(null));
  protected readonly guardando = signal(false);
  /** Los avisos se muestran recién al intentar crear, no mientras se escribe. */
  protected readonly intento = signal(false);

  protected readonly problema = computed(() => {
    if (!CODIGO_FILEMAKER.test(this.codigo().trim())) return 'Escribe el código de FileMaker: hasta 20 letras, números, puntos o guiones.';
    const v = datosDeFormulario(this.formulario());
    return 'error' in v ? v.error : null;
  });

  protected async crear(): Promise<void> {
    this.intento.set(true);
    const v = datosDeFormulario(this.formulario());
    if (this.problema() || 'error' in v || this.guardando()) return;
    this.guardando.set(true);
    try {
      const ficha = await this.servicio.crear(this.codigo().trim(), v.datos);
      this.toast.success('Médico creado. Ahora cárgale el horario.', 'Listo');
      this.creado.emit(ficha);
    } catch (err) {
      this.toast.error(mensajeDeError(err, 'No se pudo crear el médico.'), 'Error');
    } finally {
      this.guardando.set(false);
    }
  }
}
