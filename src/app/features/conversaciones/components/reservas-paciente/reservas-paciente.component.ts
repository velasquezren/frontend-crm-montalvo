import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, input, effect, untracked } from '@angular/core';
import { RealtimeService } from '../../../../core/realtime/realtime.service';
import { RouterLink } from '@angular/router';


import { BadgeComponent } from '../../../../shared/components/badge/badge.component';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { LoadingSkeletonComponent } from '../../../../shared/components/loading-skeleton/loading-skeleton.component';
import { estadoDeReserva, fechaDeReserva, ReservaAgenda } from '../../../reservas/reserva.model';
import { ReservasService } from '../../../reservas/reservas.service';

/**
 * «Próximas reservas» en la ficha del chat: las citas que esta paciente tiene
 * en la agenda de la clínica, buscadas por su teléfono. Lo ve quien ve el chat
 * (también una agente de ventas, que no tiene la pantalla Reservas): antes de
 * ofrecer una cita, sabe si ya reservó.
 */
@Component({
  selector: 'app-reservas-paciente',
  imports: [BadgeComponent, ButtonComponent, LoadingSkeletonComponent, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './reservas-paciente.component.html',
  styleUrl: './reservas-paciente.component.css',
})
export class ReservasPacienteComponent {
  private readonly servicio = inject(ReservasService);
  private readonly realtime = inject(RealtimeService);

  readonly conversacionId = input.required<string>();

  protected readonly estadoDeReserva = estadoDeReserva;
  protected readonly fechaDeReserva = fechaDeReserva;

  protected readonly reservas = httpResource<ReservaAgenda[]>(
    () => this.servicio.deConversacionRequest(this.conversacionId()),
    { defaultValue: [] },
  );

  constructor() {
    effect(() => {
      const cambio = this.realtime.actividad();
      if (cambio?.conversacionId === this.conversacionId()) untracked(() => this.reservas.reload());
    });
  }
}
