import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal, output, signal } from '@angular/core';

import { AuthService } from '../../../core/auth/auth.service';
import { mensajeDeError } from '../../../core/api/http-error';
import { ToastService } from '../../../core/toast/toast.service';
import { BadgeComponent } from '../../../shared/components/badge/badge.component';
import { SelectComponent } from '../../../shared/components/select/select.component';
import {
  CATEGORIA_BADGE,
  CATEGORIA_ICONO,
  CATEGORIA_LABEL,
  CategoriaCliente,
  EstadoCategoria,
  origenDeCategoria,
} from '../../../shared/models/cliente-categoria.model';
import { ClientesService } from '../clientes.service';

/** El `value` del selector que devuelve la categoría al cálculo. */
const AUTOMATICA = 'AUTOMATICA';

/**
 * La categoría de una paciente en su ficha: el sello y, para un SUPER_ADMIN,
 * el selector que la fija a mano o la devuelve a automática.
 *
 * La comparten la ficha de Clientes y la del chat. Antes cada una tenía un
 * `<app-select>` de categoría dentro del formulario de edición, que cualquier
 * agente podía cambiar y que la siguiente venta pisaba. Ahora la categoría la
 * calcula el valor de la paciente, y fijarla es una acción aparte que se
 * guarda al elegir: no espera al «Guardar» de la ficha.
 */
@Component({
  selector: 'app-categoria-paciente',
  imports: [BadgeComponent, SelectComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-wrap items-center gap-2">
      <app-badge [variant]="badge[categoria()]" [icon]="icono[categoria()]" [title]="origen()">
        {{ etiqueta[categoria()] }}
      </app-badge>
      <span class="text-[11px] text-text-muted">{{ fijadaEn() ? 'Fijada a mano' : 'Automática' }}</span>
      @if (puedeFijar()) {
        <div class="w-40">
          <app-select
            size="sm"
            ariaLabel="Fijar la categoría a mano o dejarla automática"
            [disabled]="guardando()"
            [activo]="!!fijadaEn()"
            [(value)]="seleccion"
            (valueChange)="elegir($event)">
            <option value="AUTOMATICA">Automática</option>
            <option value="GOLD">Fijar Gold</option>
            <option value="SILVER">Fijar Silver</option>
            <option value="BRONZE">Fijar Bronze</option>
            <option value="PROSPECTO">Fijar Prospecto</option>
          </app-select>
        </div>
      }
    </div>
  `,
})
export class CategoriaPacienteComponent {
  private readonly clientes = inject(ClientesService);
  private readonly toast = inject(ToastService);

  readonly clienteId = input.required<string>();
  readonly categoria = input.required<CategoriaCliente>();
  readonly fijadaEn = input<string | null | undefined>(null);
  /** Se emite con lo que respondió el servidor, para que la vista se refresque. */
  readonly cambiada = output<EstadoCategoria>();

  protected readonly badge = CATEGORIA_BADGE;
  protected readonly etiqueta = CATEGORIA_LABEL;
  protected readonly icono = CATEGORIA_ICONO;
  protected readonly puedeFijar = inject(AuthService).isSuperAdmin;
  protected readonly guardando = signal(false);
  protected readonly origen = computed(() => origenDeCategoria(this.fijadaEn()));
  protected readonly opcion = computed(() => (this.fijadaEn() ? this.categoria() : AUTOMATICA));
  /** Lo elegido en el selector; vuelve a lo guardado si el servidor lo rechaza. */
  protected readonly seleccion = linkedSignal(() => this.opcion());

  protected async elegir(valor: string): Promise<void> {
    if (!valor || valor === this.opcion() || this.guardando()) return;
    const categoria = valor === AUTOMATICA ? null : (valor as CategoriaCliente);
    this.guardando.set(true);
    try {
      const estado = await this.clientes.fijarCategoria(this.clienteId(), categoria);
      this.toast.success(
        categoria ? `Fijada en ${CATEGORIA_LABEL[estado.categoria]}.` : `Automática: hoy es ${CATEGORIA_LABEL[estado.categoria]}.`,
      );
      this.cambiada.emit(estado);
    } catch (error) {
      this.seleccion.set(this.opcion());
      this.toast.error(mensajeDeError(error, 'No se pudo cambiar la categoría.'));
    } finally {
      this.guardando.set(false);
    }
  }
}
