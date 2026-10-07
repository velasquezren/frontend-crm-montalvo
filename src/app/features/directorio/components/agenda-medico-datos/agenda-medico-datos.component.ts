import { ChangeDetectionStrategy, Component, computed, input, model, signal } from '@angular/core';

import { InputComponent } from '../../../../shared/components/input/input.component';
import { SelectComponent } from '../../../../shared/components/select/select.component';
import { SwitchComponent } from '../../../../shared/components/switch/switch.component';
import { BancoAgenda, EspecialidadAgenda, FormularioMedicoAgenda } from '../../agenda-medicos.model';

/** Valor del selector que abre el campo para escribir una especialidad nueva. */
const OTRA = '__otra__';

/**
 * Los datos de un médico de la agenda: los mismos campos que el formulario de
 * ScriptCase, salvo el código de FileMaker (lo pide el alta) y el horario (va
 * aparte). Lo usan la ficha y el alta; el estado vive en quien lo monta.
 */
@Component({
  selector: 'app-agenda-medico-datos',
  imports: [InputComponent, SelectComponent, SwitchComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col gap-4">
      <div class="grid grid-cols-[6rem_1fr] gap-3">
        <app-input label="Título" placeholder="Dra." [disabled]="disabled()" [value]="formulario().sigla" (valueChange)="editar('sigla', $event)" />
        <app-input label="Nombre completo" [disabled]="disabled()" [value]="formulario().nombre" (valueChange)="editar('nombre', $event)" />
      </div>

      @if (escribiendoOtra()) {
        <div class="flex flex-col gap-1.5">
          <app-input label="Especialidad nueva" placeholder="Ej. Dermatología" [disabled]="disabled()" [value]="formulario().especialidad" (valueChange)="editar('especialidad', $event)" />
          <button type="button" class="crm-enlace self-start text-xs" [disabled]="disabled()" (click)="elegirExistente()">Elegir una que ya existe</button>
        </div>
      } @else {
        <app-select label="Especialidad" [disabled]="disabled()" [value]="formulario().especialidad" (valueChange)="elegirEspecialidad($event)">
          <option value="">Elige una especialidad</option>
          @for (e of opciones(); track e) {
            <option [value]="e">{{ e }}</option>
          }
          <option [value]="otra">Otra (escribirla)…</option>
        </app-select>
      }

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <app-input label="Precio de la consulta (Bs)" placeholder="250" [disabled]="disabled()" [value]="formulario().precio" (valueChange)="editar('precio', $event)" />
        <app-select label="QR de cobro" [disabled]="disabled()" [value]="formulario().bancoId" (valueChange)="editar('bancoId', $event)">
          <option value="">Sin QR</option>
          @for (b of bancos(); track b.id) {
            <option [value]="'' + b.id">{{ b.nombre }}{{ b.vence ? ' · vence ' + b.vence : '' }}</option>
          }
        </app-select>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <app-input label="Teléfono (solo para la clínica)" type="tel" [disabled]="disabled()" [value]="formulario().telefono" (valueChange)="editar('telefono', $event)" />
        <app-input label="Orden en la web" type="number" [disabled]="disabled()" [value]="formulario().orden" (valueChange)="editar('orden', $event)" />
      </div>

      <div class="flex items-center justify-between gap-3 rounded-xl border border-border px-3.5 py-2.5">
        <div class="min-w-0">
          <p class="text-sm font-medium text-text-dark">Activo en la agenda</p>
          <p class="text-xs text-text-muted">Inactivo, no se ofrece en la web ni recibe reservas nuevas.</p>
        </div>
        <app-switch ariaLabel="Activo en la agenda" [disabled]="disabled()" [value]="formulario().estado === 'ACTIVO'" (valueChange)="editar('estado', $event ? 'ACTIVO' : 'INACTIVO')" />
      </div>
    </div>
  `,
})
export class AgendaMedicoDatosComponent {
  readonly formulario = model.required<FormularioMedicoAgenda>();
  readonly especialidades = input<readonly EspecialidadAgenda[]>([]);
  readonly bancos = input<readonly BancoAgenda[]>([]);
  readonly disabled = input(false);

  protected readonly otra = OTRA;
  private readonly quiereOtra = signal(false);

  protected readonly opciones = computed(() => this.especialidades().map(e => e.nombre));
  /** También cuando la especialidad del médico no está en la lista (recién escrita en otro lado). */
  protected readonly escribiendoOtra = computed(() => {
    const actual = this.formulario().especialidad.trim();
    return this.quiereOtra() || (actual !== '' && this.especialidades().length > 0 && !this.opciones().includes(actual));
  });

  protected editar<K extends keyof FormularioMedicoAgenda>(campo: K, valor: FormularioMedicoAgenda[K]): void {
    this.formulario.update(f => ({ ...f, [campo]: valor }));
  }

  protected elegirEspecialidad(valor: string): void {
    if (valor === OTRA) {
      this.quiereOtra.set(true);
      this.editar('especialidad', '');
      return;
    }
    this.editar('especialidad', valor);
  }

  protected elegirExistente(): void {
    this.quiereOtra.set(false);
    this.editar('especialidad', '');
  }
}
