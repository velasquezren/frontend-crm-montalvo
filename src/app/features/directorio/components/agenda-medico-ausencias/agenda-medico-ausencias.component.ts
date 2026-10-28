import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal, output, signal } from '@angular/core';

import { mensajeDeError } from '../../../../core/api/http-error';
import { FechaCivilPipe } from '../../../../core/fechas/fecha-civil.pipe';
import { fechaCivilClinica } from '../../../../core/fechas/zona-clinica';
import { ToastService } from '../../../../core/toast/toast.service';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { IconComponent } from '../../../../shared/components/icon/icon.component';
import { InputComponent } from '../../../../shared/components/input/input.component';
import { AusenciaAgenda, textoPendientes } from '../../agenda-medicos.model';
import { AgendaMedicosService } from '../../agenda-medicos.service';

/**
 * Vacaciones y ausencias de un médico de la agenda (docs/agenda.md del backend).
 * La agenda de ScriptCase y FileMaker no saben de vacaciones: las guarda el CRM,
 * y desde que se guardan la web, el Flow, el asistente y «Cupos» dejan de
 * ofrecer esos días. Lo ya agendado no se mueve: cada ausencia dice cuántas
 * citas y reservas tiene esos días, para que recepción las reprograme.
 *
 * Cada gesto se guarda solo (sin borrador ni versión): es una fila que se
 * agrega o se quita, y el servidor devuelve la lista nueva.
 */
@Component({
  selector: 'app-agenda-medico-ausencias',
  imports: [ButtonComponent, FechaCivilPipe, IconComponent, InputComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './agenda-medico-ausencias.component.html',
})
export class AgendaMedicoAusenciasComponent {
  private readonly servicio = inject(AgendaMedicosService);
  private readonly toast = inject(ToastService);

  readonly id = input.required<number>();
  readonly nombre = input.required<string>();
  readonly ausencias = input<readonly AusenciaAgenda[]>([]);
  readonly editable = input(false);
  /** La lista que quedó en el servidor, para que la ficha la conserve. */
  readonly cambiadas = output<AusenciaAgenda[]>();

  protected readonly lista = linkedSignal(() => this.ausencias());
  protected readonly desde = signal('');
  protected readonly hasta = signal('');
  protected readonly motivo = signal('Vacaciones');
  /** 'agregar' o el id de la que se está quitando. */
  protected readonly ocupado = signal<string | null>(null);
  protected readonly textoPendientes = textoPendientes;

  protected readonly falta = computed(() => {
    const desde = this.desde();
    const hasta = this.hasta();
    if (!desde || !hasta) return 'Elige desde y hasta qué día no atiende.';
    if (hasta < desde) return 'El último día es anterior al primero.';
    if (hasta < fechaCivilClinica(new Date())) return 'Esas fechas ya pasaron.';
    return null;
  });

  protected async agregar(): Promise<void> {
    if (this.falta() || this.ocupado()) return;
    this.ocupado.set('agregar');
    try {
      const motivo = this.motivo().trim();
      const r = await this.servicio.agregarAusencia(this.id(), { desde: this.desde(), hasta: this.hasta(), ...(motivo ? { motivoPublico: motivo } : {}) });
      this.aplicar(r.ausencias);
      this.desde.set('');
      this.hasta.set('');
      this.toast.success('Esos días ya no se ofrecen para reservar.', 'Ausencia guardada');
    } catch (err) {
      this.toast.error(mensajeDeError(err, 'No se pudo guardar la ausencia.'), 'Error');
    } finally {
      this.ocupado.set(null);
    }
  }

  protected async quitar(a: AusenciaAgenda): Promise<void> {
    if (this.ocupado()) return;
    this.ocupado.set(a.id);
    try {
      this.aplicar((await this.servicio.quitarAusencia(this.id(), a.id)).ausencias);
      this.toast.success('Esos días vuelven a ofrecerse según su horario.', 'Ausencia quitada');
    } catch (err) {
      this.toast.error(mensajeDeError(err, 'No se pudo quitar la ausencia.'), 'Error');
    } finally {
      this.ocupado.set(null);
    }
  }

  private aplicar(ausencias: AusenciaAgenda[]): void {
    this.lista.set(ausencias);
    this.cambiadas.emit(ausencias);
  }
}
